"""Controlled WebSocket events only; never authenticates to a real exchange/provider."""
import asyncio
from contextlib import asynccontextmanager
from datetime import timedelta
import json

import pytest
from fastapi.testclient import TestClient
from app.market_stream import alpaca
from app.main import app
from app import database


def tick(symbol='SPY', **changes):
    return {'T': 't', 'S': symbol, 'p': 123.45, 't': alpaca.utcnow().isoformat(), 'x': 'V', **changes}


class MockSocket:
    def __init__(self, frames):
        self.frames = asyncio.Queue()
        for frame in frames:
            self.frames.put_nowait(json.dumps(frame))
        self.sent = []
        self.closed = False
        self.pings = 0

    async def recv(self):
        return await self.frames.get()

    async def send(self, value):
        self.sent.append(json.loads(value))

    async def ping(self):
        self.pings += 1
        result = asyncio.get_running_loop().create_future()
        result.set_result(None)
        return result


def connector(socket, calls):
    @asynccontextmanager
    async def connect(url, **options):
        calls.append((url, options))
        try:
            yield socket
        finally:
            socket.closed = True
    return connect


async def no_clock():
    raise ValueError('Controlled clock unavailable')


def configure(monkeypatch, feed='iex'):
    monkeypatch.setenv('ALPACA_API_KEY', 'TEST_ONLY_KEY')
    monkeypatch.setenv('ALPACA_API_SECRET', 'TEST_ONLY_SECRET')
    monkeypatch.setenv('ALPACA_DATA_FEED', feed)
    monkeypatch.setenv('ALPACA_ACCOUNT_ENV', 'paper')


async def until(predicate):
    for _ in range(100):
        if predicate():
            return
        await asyncio.sleep(.001)
    raise AssertionError('Expected stream condition not reached')


def test_single_upstream_auth_subscription_normalized_trade_and_shutdown(monkeypatch):
    configure(monkeypatch)
    async def run():
        trade = tick()
        socket = MockSocket([[{'T':'success','msg':'connected'}], [{'T':'success','msg':'authenticated'}],
                             [{'T':'subscription','trades':list(alpaca.SYMBOLS)}, trade]])
        calls = []
        hub = alpaca.AlpacaHub(connector(socket, calls), no_clock)
        q1, q2 = await hub.subscribe(), await hub.subscribe()
        await until(lambda: 'SPY' in hub.quotes)
        packet = await q1.get()
        assert packet['connection_state'] == 'connected'
        assert packet['subscription_confirmed'] is True
        assert socket.sent == [{'action':'auth','key':'TEST_ONLY_KEY','secret':'TEST_ONLY_SECRET'},
                               {'action':'subscribe','trades':list(alpaca.SYMBOLS)}]
        assert len(calls) == 1
        assert calls[0][0] == 'wss://stream.data.alpaca.markets/v2/iex'
        assert calls[0][1]['ping_timeout'] == 15
        quote = packet['quotes']['SPY']
        assert quote['price'] == 123.45 and quote['exchange_timestamp'] == trade['t']
        assert quote['received_at'] and quote['feed'] == 'iex'
        assert quote['daily_change'] is quote['previous_close'] is None
        assert 'TEST_ONLY' not in json.dumps(packet)
        await hub.unsubscribe(q1)
        assert not socket.closed
        await hub.unsubscribe(q2)
        assert socket.closed and hub.runner is None and not hub.quotes
    asyncio.run(run())


@pytest.mark.parametrize('code,reason', [(402,'authentication_failed'), (409,'subscription_denied'), (405,'symbol_limit')])
def test_terminal_provider_errors_never_fallback_or_retry(monkeypatch, code, reason):
    configure(monkeypatch, 'sip')
    async def run():
        socket = MockSocket([[{'T':'success','msg':'connected'}], [{'T':'error','code':code,'msg':'TEST secret body never exposed'}]])
        calls = []
        hub = alpaca.AlpacaHub(connector(socket, calls), no_clock)
        queue = await hub.subscribe()
        await until(lambda: hub.state == 'unavailable')
        assert hub.error == reason and hub.confirmed is False
        assert len(calls) == 1 and calls[0][0].endswith('/sip')
        assert 'secret body' not in json.dumps(hub.snapshot())
        await hub.unsubscribe(queue)
    asyncio.run(run())


def test_trade_validation_stale_prices_and_out_of_order():
    hub = alpaca.AlpacaHub()
    old = (alpaca.utcnow() - timedelta(minutes=10)).isoformat()
    assert hub.trade(tick(t=old))
    assert hub.quotes['SPY']['exchange_timestamp'] == old  # Never restamped as fresh.
    for changes in ({'p':float('nan')}, {'p':-1}, {'p':True}, {'p':'123'}, {'S':'CASH'},
                    {'t':'not a timestamp'}, {'t':alpaca.utcnow().replace(tzinfo=None).isoformat()},
                    {'t':(alpaca.utcnow()+timedelta(days=1)).isoformat()}):
        assert not hub.trade(tick(**changes))
    fresh = tick()
    assert hub.trade(fresh)
    assert not hub.trade(fresh)
    assert not hub.trade(tick(t=old))
    assert hub.quotes['SPY']['price'] == fresh['p']


def test_reconnect_backoff_does_not_overlap(monkeypatch):
    configure(monkeypatch)
    async def run():
        calls = []
        @asynccontextmanager
        async def failed(url, **options):
            calls.append(url)
            raise ConnectionError('TEST ONLY failure')
            yield
        hub = alpaca.AlpacaHub(failed, no_clock)
        queue = await hub.subscribe()
        await until(lambda: hub.state == 'reconnecting')
        assert 2 <= hub.retry_seconds <= 3
        assert hub.confirmed is False and len(calls) == 1
        await hub.unsubscribe(queue)
        assert hub.runner is None
    asyncio.run(run())


def test_confirmed_sip_and_market_closed_clock(monkeypatch):
    configure(monkeypatch, 'sip')
    async def run():
        socket = MockSocket([[{'T':'success','msg':'connected'}], [{'T':'success','msg':'authenticated'}],
                             [{'T':'subscription','trades':list(alpaca.SYMBOLS)}]])
        async def closed():
            now = alpaca.utcnow()
            return {'is_open':False,'timestamp':now.isoformat(),
                    'next_open':(now+timedelta(days=1)).isoformat(),'next_close':(now+timedelta(days=1,hours=6)).isoformat()}
        hub = alpaca.AlpacaHub(connector(socket, []), closed)
        queue = await hub.subscribe()
        await until(lambda: hub.confirmed and hub.market is not None)
        assert hub.snapshot()['feed'] == 'sip'
        assert hub.market['is_open'] is False
        assert hub.quotes == {}  # Closed market does not manufacture prices.
        await hub.unsubscribe(queue)
    asyncio.run(run())


def test_missing_credentials_and_invalid_feed(monkeypatch):
    monkeypatch.delenv('ALPACA_API_KEY', raising=False)
    monkeypatch.delenv('ALPACA_API_SECRET', raising=False)
    monkeypatch.setenv('ALPACA_DATA_FEED','iex')
    async def run():
        hub = alpaca.AlpacaHub()
        queue = await hub.subscribe()
        assert hub.error == 'missing_credentials' and hub.runner is None
        await hub.unsubscribe(queue)
        monkeypatch.setenv('ALPACA_DATA_FEED','delayed_sip')
        queue = await hub.subscribe()
        assert hub.error == 'invalid_configuration' and hub.runner is None
        await hub.unsubscribe(queue)
    asyncio.run(run())


def test_websocket_route_origin_guard_and_missing_credentials(tmp_path, monkeypatch):
    monkeypatch.setattr(database, 'DB_PATH', tmp_path/'stream.db')
    monkeypatch.delenv('ALPACA_API_KEY', raising=False)
    monkeypatch.delenv('ALPACA_API_SECRET', raising=False)
    monkeypatch.setenv('ALPACA_DATA_FEED','iex')
    with TestClient(app) as client:
        with pytest.raises(Exception) as denied:
            with client.websocket_connect('/api/market/stream', headers={'origin':'https://untrusted.example'}):
                pass
        assert denied.value.code == 1008
        with client.websocket_connect('/api/market/stream', headers={'origin':'http://localhost:5173'}) as ws:
            packet = ws.receive_json()
            assert packet['connection_state'] == 'unavailable'
            assert packet['error_code'] == 'missing_credentials'
            assert packet['quotes'] == {}


def test_heartbeat_quiet_market_and_reconnect_retains_real_timestamp(monkeypatch):
    configure(monkeypatch)
    async def run():
        trade = tick()
        class BrokenSocket(MockSocket):
            async def recv(self):
                if self.frames.empty():
                    raise ConnectionError('TEST socket dropped')
                return await super().recv()
        class QuietSocket(MockSocket):
            quiet = False
            async def recv(self):
                if self.frames.empty() and not self.quiet:
                    self.quiet = True
                    raise asyncio.TimeoutError()
                return await super().recv()
        handshake = [[{'T':'success','msg':'connected'}], [{'T':'success','msg':'authenticated'}],
                     [{'T':'subscription','trades':list(alpaca.SYMBOLS)}, trade]]
        first, second = BrokenSocket(handshake), QuietSocket(handshake[:2]+[[{'T':'subscription','trades':list(alpaca.SYMBOLS)}]])
        calls, waits = [], []
        @asynccontextmanager
        async def connect(url, **options):
            socket = first if not calls else second
            calls.append(url)
            try:
                yield socket
            finally:
                socket.closed = True
        async def fast_backoff(delay):
            waits.append(delay)
        hub = alpaca.AlpacaHub(connect, no_clock, fast_backoff)
        queue = await hub.subscribe()
        await until(lambda: second.pings == 1)
        assert len(calls) == 2 and first.closed and not second.closed
        assert hub.quotes['SPY']['exchange_timestamp'] == trade['t']
        assert hub.confirmed and waits[0] >= 2
        await hub.unsubscribe(queue)
        assert second.closed
    asyncio.run(run())


def test_rate_limit_retry_after_and_stale_clock(monkeypatch):
    from types import SimpleNamespace
    response = SimpleNamespace(headers={'Retry-After':'180'})
    assert alpaca.retry_after(response) == 180
    assert alpaca.retry_after(None) == 0
    configure(monkeypatch)
    async def run():
        async def stale_clock():
            old = alpaca.utcnow()-timedelta(hours=2)
            return {'is_open':False,'timestamp':old.isoformat(),'next_open':old.isoformat(),'next_close':old.isoformat()}
        hub = alpaca.AlpacaHub(clock_fetcher=stale_clock)
        task = asyncio.create_task(hub.clock_loop())
        await asyncio.sleep(.001)
        assert hub.market is None
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
    asyncio.run(run())


def test_real_local_websocket_transport_with_mock_alpaca_protocol(monkeypatch):
    """Real loopback sockets, mocked Alpaca server only; no external exchange."""
    from websockets.asyncio.server import serve
    from websockets.asyncio.client import connect
    configure(monkeypatch)
    async def run():
        received = []
        async def mock_alpaca(ws):
            await ws.send(json.dumps([{'T':'success','msg':'connected'}]))
            received.append(json.loads(await ws.recv()))
            await ws.send(json.dumps([{'T':'success','msg':'authenticated'}]))
            received.append(json.loads(await ws.recv()))
            await ws.send(json.dumps([{'T':'subscription','trades':list(alpaca.SYMBOLS)},tick('QQQ')]))
            await ws.wait_closed()
        async with serve(mock_alpaca, '127.0.0.1', 0) as server:
            port = server.sockets[0].getsockname()[1]
            def local_connector(_url, **options):
                return connect(f'ws://127.0.0.1:{port}', **options)
            hub = alpaca.AlpacaHub(local_connector, no_clock)
            queue = await hub.subscribe()
            await until(lambda: 'QQQ' in hub.quotes)
            assert received[0]['action'] == 'auth'
            assert received[1] == {'action':'subscribe','trades':list(alpaca.SYMBOLS)}
            assert hub.confirmed and hub.quotes['QQQ']['price'] == 123.45
            await hub.unsubscribe(queue)
    asyncio.run(run())
