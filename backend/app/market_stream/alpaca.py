"""Read-only Alpaca stock trade stream. One upstream per API process (single worker).

JSON protocol: https://docs.alpaca.markets/docs/streaming-market-data
No quote generation, feed fallback, brokerage orders or historical dataset mutation.
"""
import asyncio
from contextlib import suppress
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import json
import math
import logging
import os
import random
import re

import httpx
from websockets.asyncio.client import connect
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

TRANSPORT_LOGGER = logging.Logger('verdant.alpaca.transport', level=logging.CRITICAL + 1)

SYMBOLS = ('SPY', 'AGG', 'GLD', 'QQQ')
TERMINAL = {401: 'authentication_failed', 402: 'authentication_failed',
            404: 'authentication_timeout', 405: 'symbol_limit',
            409: 'subscription_denied', 410: 'invalid_subscription'}
MESSAGES = {
    'missing_credentials': 'Set ALPACA_API_KEY and ALPACA_API_SECRET securely in the backend environment, then restart.',
    'invalid_configuration': 'ALPACA_DATA_FEED must be iex or sip; ALPACA_ACCOUNT_ENV must be paper or live.',
    'authentication_failed': 'Alpaca authentication failed. Check backend credentials and restart; no feed fallback was used.',
    'authentication_timeout': 'Alpaca authentication timed out. Check credentials and restart.',
    'subscription_denied': 'Requested Alpaca feed is not authorized for this subscription. No alternate or delayed feed was used.',
    'symbol_limit': 'Alpaca rejected the symbol subscription limit.',
    'invalid_subscription': 'Alpaca rejected the requested subscription.',
    'provider_unavailable': 'Alpaca connection interrupted; reconnecting with bounded backoff.',
    'connection_limit': 'Alpaca connection limit reached. Retrying with backoff; use one API worker.',
    'rate_limited': 'Alpaca rate limited the connection. Retrying with backoff.',
    'access_denied': 'Alpaca denied access. Check account permissions; no fallback was used.',
}


def utcnow():
    return datetime.now(timezone.utc)


def timestamp(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,9})?(?:Z|[+-]\d\d:\d\d)', value):
        raise ValueError('invalid_timestamp')
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    if parsed.utcoffset() is None:
        raise ValueError('missing_timezone')
    return parsed


def retry_after(response):
    try:
        value = response.headers.get('Retry-After', '')
        if value.isdigit():
            return int(value)
        return max(0, (parsedate_to_datetime(value) - utcnow()).total_seconds())
    except (AttributeError, TypeError, ValueError, OverflowError):
        return 0


class StreamFailure(Exception):
    def __init__(self, code, terminal=False):
        self.code, self.terminal = code, terminal
        super().__init__(code)


class AlpacaHub:
    def __init__(self, connector=connect, clock_fetcher=None, sleeper=asyncio.sleep):
        self.pause = sleeper
        self.connector = connector
        self.clock_fetcher = clock_fetcher or self.fetch_clock
        self.listeners = set()
        self.lock = asyncio.Lock()
        self.runner = self.clock_task = None
        self.quotes = {}
        self.state, self.error, self.feed = 'disconnected', None, 'iex'
        self.confirmed = False
        self.market = None
        self.key = self.secret = None
        self.account = 'paper'
        self.retry_seconds = None

    def snapshot(self):
        return {'type': 'snapshot', 'provider': 'Alpaca Market Data', 'feed': self.feed,
                'connection_state': self.state, 'subscription_confirmed': self.confirmed,
                'error_code': self.error, 'message': MESSAGES.get(self.error),
                'retry_seconds': self.retry_seconds, 'market': self.market,
                'exchange_timezone': 'America/New_York', 'stale_after_seconds': 60,
                'quotes': self.quotes.copy()}

    def publish(self):
        packet = self.snapshot()
        for queue in self.listeners:
            # Slow clients receive the latest snapshot without unbounded buffering.
            if queue.full():
                queue.get_nowait()
            queue.put_nowait(packet)

    async def subscribe(self):
        async with self.lock:
            queue = asyncio.Queue(maxsize=1)
            self.listeners.add(queue)
            if self.runner is None:
                self.feed = os.getenv('ALPACA_DATA_FEED', 'iex').lower().strip()
                self.account = os.getenv('ALPACA_ACCOUNT_ENV', 'paper').lower().strip()
                self.key = os.getenv('ALPACA_API_KEY', '').strip()
                self.secret = os.getenv('ALPACA_API_SECRET', '').strip()
                self.state, self.error, self.confirmed = 'connecting', None, False
                if self.feed not in {'iex', 'sip'} or self.account not in {'paper', 'live'}:
                    self.state, self.error = 'unavailable', 'invalid_configuration'
                elif not self.key or not self.secret:
                    self.state, self.error = 'unavailable', 'missing_credentials'
                else:
                    self.runner = asyncio.create_task(self.run())
                    self.clock_task = asyncio.create_task(self.clock_loop())
            self.publish()
            return queue

    async def unsubscribe(self, queue):
        async with self.lock:
            self.listeners.discard(queue)
            if not self.listeners:
                await self.stop()

    async def stop(self):
        for task in (self.runner, self.clock_task):
            if task is not None:
                task.cancel()
        for task in (self.runner, self.clock_task):
            if task is not None:
                with suppress(asyncio.CancelledError):
                    await task
        self.runner = self.clock_task = None
        self.state, self.confirmed = 'disconnected', False
        self.retry_seconds = None
        self.key = self.secret = None
        self.quotes.clear()
        self.market = None

    async def close(self):
        async with self.lock:
            await self.stop()
            self.listeners.clear()

    def frames(self, raw):
        try:
            events = json.loads(raw)
            if not isinstance(events, list) or len(events) > 10000:
                raise ValueError()
            for event in events:
                if not isinstance(event, dict):
                    raise ValueError()
                if event.get('T') == 'error':
                    code = event.get('code')
                    raise StreamFailure(TERMINAL.get(code, 'connection_limit' if code == 406 else 'rate_limited' if code == 429 else 'provider_unavailable'), code in TERMINAL)
            return events
        except (ValueError, TypeError, UnicodeDecodeError):
            raise StreamFailure('provider_unavailable') from None

    async def expect(self, ws, kind, message=None):
        events = self.frames(await asyncio.wait_for(ws.recv(), 10))
        if not any(e.get('T') == kind and (message is None or e.get('msg') == message) for e in events):
            raise StreamFailure('provider_unavailable')
        return events

    def trade(self, event):
        symbol, price, exchange_time = event.get('S'), event.get('p'), event.get('t')
        if event.get('T') != 't' or symbol not in SYMBOLS or isinstance(price, bool) or not isinstance(price, (int, float)) or not math.isfinite(price) or price <= 0:
            return False
        try:
            parsed = timestamp(exchange_time)
            received = utcnow()
            if parsed > received + timedelta(minutes=5):
                return False
            previous = self.quotes.get(symbol)
            if previous and parsed <= timestamp(previous['exchange_timestamp']):
                return False
        except (ValueError, TypeError, OverflowError):
            return False
        exchange = event.get('x')
        self.quotes[symbol] = {'symbol': symbol, 'price': price, 'currency': 'USD',
                               'exchange_timestamp': exchange_time, 'received_at': received.isoformat(),
                               'provider': 'Alpaca Market Data', 'feed': self.feed,
                               'exchange': exchange if isinstance(exchange, str) and len(exchange) <= 16 else None,
                               'previous_close': None, 'daily_change': None, 'daily_change_percent': None}
        return True

    async def session(self):
        async with self.connector(f'wss://stream.data.alpaca.markets/v2/{self.feed}',
                                  additional_headers={'Content-Type': 'application/json'},
                                  open_timeout=10, close_timeout=5, ping_interval=20,
                                  ping_timeout=15, max_size=2**20, max_queue=16, logger=TRANSPORT_LOGGER) as ws:
            await self.expect(ws, 'success', 'connected')
            await ws.send(json.dumps({'action': 'auth', 'key': self.key, 'secret': self.secret}))
            await self.expect(ws, 'success', 'authenticated')
            await ws.send(json.dumps({'action': 'subscribe', 'trades': list(SYMBOLS)}))
            events = await self.expect(ws, 'subscription')
            if not any(e.get('T') == 'subscription' and set(e.get('trades', [])) == set(SYMBOLS) for e in events):
                raise StreamFailure('invalid_subscription', True)
            self.state, self.confirmed, self.error = 'connected', True, None
            self.retry_seconds = None
            for event in events:
                self.trade(event)
            self.publish()
            while True:
                try:
                    raw = await asyncio.wait_for(ws.recv(), 45)
                except asyncio.TimeoutError:
                    # A quiet/closed market is not a disconnected socket. Require a pong.
                    pong = await ws.ping()
                    await asyncio.wait_for(pong, 10)
                    continue
                changed = False
                for event in self.frames(raw):
                    changed = self.trade(event) or changed
                    if event.get('T') in {'c', 'x'} and event.get('S') in self.quotes:
                        # Do not continue presenting a possibly cancelled/corrected trade.
                        del self.quotes[event['S']]
                        changed = True
                if changed:
                    self.publish()

    async def run(self):
        attempt = 0
        while True:
            self.state = 'connecting' if attempt == 0 else 'reconnecting'
            self.confirmed = False
            self.publish()
            started = asyncio.get_running_loop().time()
            try:
                await self.session()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                provider_wait = retry_after(getattr(exc, "response", None))
                if isinstance(exc, StreamFailure):
                    failure = exc
                else:
                    status = getattr(getattr(exc, 'response', None), 'status_code', None)
                    failure = StreamFailure('access_denied' if status in {401, 403} else 'rate_limited' if status == 429 else 'provider_unavailable', status in {401, 403})
                self.error, self.confirmed = failure.code, False
                self.state = 'unavailable' if failure.terminal else 'reconnecting'
                if failure.terminal:
                    if self.clock_task:
                        self.clock_task.cancel()
                    self.market = None
                    self.publish()
                    return
                if asyncio.get_running_loop().time() - started >= 120:
                    attempt = 0
                attempt = min(attempt + 1, 7)
                delay = min(60, 2 ** attempt) + random.uniform(0, 1)
                if failure.code in {'rate_limited', 'connection_limit'}:
                    delay = max(60, delay)
                delay = max(delay, provider_wait)
                self.retry_seconds = round(delay)
                self.publish()
                await self.pause(delay)

    async def fetch_clock(self):
        host = 'paper-api.alpaca.markets' if self.account == 'paper' else 'api.alpaca.markets'
        async with httpx.AsyncClient(timeout=10, follow_redirects=False) as client:
            response = await client.get(f'https://{host}/v2/clock', headers={
                'APCA-API-KEY-ID': self.key, 'APCA-API-SECRET-KEY': self.secret})
            response.raise_for_status()
            return response.json()

    async def clock_loop(self):
        while True:
            delay = 60
            try:
                clock = await self.clock_fetcher()
                observed = utcnow()
                provider_time = timestamp(clock['timestamp'])
                if type(clock['is_open']) is not bool or abs((observed - provider_time).total_seconds()) > 120:
                    raise ValueError('invalid_clock')
                for key in ('next_open', 'next_close'):
                    timestamp(clock[key])
                self.market = {k: clock[k] for k in ('is_open', 'timestamp', 'next_open', 'next_close')}
                self.market['checked_at'] = observed.isoformat()
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                delay = max(delay, retry_after(getattr(exc, "response", None)))
                # No inferred weekday/holiday status if account clock isn't accessible.
                self.market = None
            self.publish()
            await asyncio.sleep(delay)


hub = AlpacaHub()
router = APIRouter()


@router.websocket('/api/market/stream')
async def market_stream(websocket: WebSocket):
    # Local research UI by default. Deployment origins must be explicitly configured
    # behind an authenticated reverse proxy and permitted by the data license.
    allowed = {s.strip() for s in os.getenv('ALPACA_STREAM_ALLOWED_ORIGINS',
        'http://localhost:5173,http://127.0.0.1:5173,http://localhost:8000,http://127.0.0.1:8000').split(',') if s.strip()}
    if websocket.headers.get('origin') not in allowed or len(hub.listeners) >= 8:
        await websocket.close(code=1008)
        return
    await websocket.accept()
    queue = await hub.subscribe()
    async def sender():
        while True:
            await websocket.send_json(await queue.get())
    async def receiver():
        while True:
            await websocket.receive_text()
    send_task = asyncio.create_task(sender())
    receive_task = asyncio.create_task(receiver())
    try:
        await asyncio.wait((send_task, receive_task), return_when=asyncio.FIRST_COMPLETED)
    except WebSocketDisconnect:
        pass
    finally:
        for task in (send_task, receive_task):
            task.cancel()
        for task in (send_task, receive_task):
            with suppress(asyncio.CancelledError, WebSocketDisconnect, RuntimeError):
                await task
        await hub.unsubscribe(queue)
