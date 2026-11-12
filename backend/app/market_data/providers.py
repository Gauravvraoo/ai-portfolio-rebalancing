"""Legitimate provider adapters. No proxy bypass, synthetic fallback or raw-error logging."""
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
import logging
import os
import re
import time

import httpx
import numpy as np
import pandas as pd
from app.rl.data import SYMBOLS

PROVIDERS = {
    'yahoo': ('Yahoo Finance via yfinance', 'yfinance auto_adjust=True: split/dividend-adjusted Close'),
    'tiingo': ('Tiingo End-of-Day API', 'Tiingo adjClose: split/dividend-adjusted daily close'),
}


class ProviderError(Exception):
    def __init__(self, provider, code, symbol=None, phase='fetch', http_status=None, attempts=1, retry_after=None):
        self.provider = provider
        self.code = code
        self.symbol = symbol
        self.phase = phase
        self.http_status = http_status
        self.attempts = attempts
        self.retry_after = retry_after
        # Never include exception strings, response bodies, headers or URLs here.
        super().__init__(code)

    def diagnostic(self):
        return dict(provider=self.provider, code=self.code, symbol=self.symbol,
                    phase=self.phase, http_status=self.http_status, attempts=self.attempts, retry_after_seconds=self.retry_after)


def retry_after_seconds(response):
    value = response.headers.get('Retry-After', '') if response is not None else ''
    try:
        if value.isdigit():
            return max(0, int(value))
        parsed = parsedate_to_datetime(value)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return max(0, int((parsed - datetime.now(timezone.utc)).total_seconds()))
    except (ValueError, TypeError, OverflowError):
        return None


def classify(exc, provider, symbol=None):
    if isinstance(exc, ProviderError):
        return exc
    # Raw exception text is inspected locally only, never returned/logged/stored.
    text = str(exc).lower()
    response = getattr(exc, 'response', None)
    status = getattr(response, 'status_code', None)
    if not isinstance(status, int) or not 100 <= status <= 599:
        status = None
    if status is None:
        match = re.search(r'\b(401|403|407|429|500|502|503|504)\b', text)
        status = int(match.group(1)) if match else None
    if status == 429 or 'ratelimit' in type(exc).__name__.lower() or 'rate limit' in text:
        code = 'rate_limited'
    elif status == 407:
        code = 'proxy_authentication'
    elif status == 403 and ('connect' in text or 'proxy' in text):
        code = 'proxy_denied'
    elif status in (401, 403):
        code = 'access_denied'
    elif status == 404:
        code = 'symbol_unavailable'
    elif status and 300 <= status < 400:
        code = 'unexpected_redirect'
    elif status and status >= 500:
        code = 'provider_unavailable'
    elif isinstance(exc, httpx.TimeoutException) or 'timeout' in type(exc).__name__.lower() or 'timed out' in text or getattr(exc, 'code', None) == 28:
        code = 'timeout'
    elif 'certificate' in text or 'ssl' in text or getattr(exc, 'code', None) in (60, 77):
        code = 'tls_error'
    elif 'proxy' in text:
        code = 'proxy_error'
    elif isinstance(exc, (httpx.ConnectError, ConnectionError)) or 'connection' in type(exc).__name__.lower():
        code = 'connection_error'
    elif isinstance(exc, (ValueError, KeyError, TypeError)):
        code = 'invalid_payload'
    else:
        code = 'provider_error'
    return ProviderError(provider, code, symbol, http_status=status,
                         retry_after=retry_after_seconds(response) if status in (429, 503) else None)


def fetch_with_retry(operation, provider, symbol):
    # Only a single bounded retry for transient transport/server failures.
    # Never retry access denials, TLS failures, 429s or invalid prices immediately.
    for attempt in (1, 2):
        try:
            return operation()
        except Exception as exc:
            error = classify(exc, provider, symbol)
            error.attempts = attempt
            if attempt == 1 and not error.retry_after and error.code in {'timeout', 'connection_error', 'provider_unavailable'}:
                time.sleep(0.5)
                continue
            raise error from None


def adjusted_series(frame, column, provider, symbol):
    if not isinstance(frame, pd.DataFrame) or frame.empty:
        raise ProviderError(provider, 'empty_dataset', symbol, 'parse')
    if column not in frame.columns or not isinstance(frame[column], pd.Series):
        raise ProviderError(provider, 'missing_adjusted_close', symbol, 'parse')
    try:
        series = pd.to_numeric(frame[column], errors='raise').astype(float)
        # Preserve the exchange-local date of timezone-aware daily bars.
        series.index = pd.Index([pd.Timestamp(d).date().isoformat() for d in frame.index])
    except (TypeError, ValueError, OverflowError):
        raise ProviderError(provider, 'invalid_prices', symbol, 'parse') from None
    if series.index.has_duplicates:
        raise ProviderError(provider, 'duplicate_dates', symbol, 'parse')
    # Drop missing observations; never fill or use unadjusted Close instead.
    series = series.dropna()
    if series.empty:
        raise ProviderError(provider, 'missing_prices', symbol, 'parse')
    if not np.isfinite(series.to_numpy()).all() or (series <= 0).any():
        raise ProviderError(provider, 'invalid_prices', symbol, 'parse')
    return series.rename(symbol)


def align_prices(columns, start, end, provider):
    aligned = pd.concat(columns, axis=1, join='inner').sort_index().dropna()
    aligned = aligned.loc[(aligned.index >= start.isoformat()) & (aligned.index < end.isoformat())]
    if len(aligned) < 150:
        raise ProviderError(provider, 'insufficient_history', phase='align')
    prices = aligned.to_numpy(dtype=np.float64)
    if prices.shape[1] != 4 or not np.isfinite(prices).all() or (prices <= 0).any():
        raise ProviderError(provider, 'invalid_prices', phase='align')
    # CASH is never sent to any provider, and yield is accrued by execution once.
    return np.array(aligned.index, dtype='<U10'), np.column_stack((prices, np.ones(len(prices))))


@contextmanager
def yahoo_exception_policy(yf):
    previous = yf.config.debug.hide_exceptions
    logger = logging.getLogger('yfinance')
    was_disabled = logger.disabled
    try:
        # This also exposes timezone/bootstrap errors (old raise_errors did not).
        yf.config.debug.hide_exceptions = False
        # SDK error strings/debug dumps may contain proxy URLs. Our diagnostics
        # deliberately replace them with whitelisted codes only.
        logger.disabled = True
        yield
    finally:
        yf.config.debug.hide_exceptions = previous
        logger.disabled = was_disabled


def yahoo_prices(start, end, cache_root):
    import yfinance as yf
    yf.set_tz_cache_location(str(cache_root / 'provider'))
    columns = []
    with yahoo_exception_policy(yf):
        for symbol in SYMBOLS[:-1]:
            def fetch():
                frame = yf.Ticker(symbol).history(
                    start=start.isoformat(), end=end.isoformat(), interval='1d',
                    auto_adjust=True, actions=False, repair=False, keepna=True, timeout=10,
                )
                return adjusted_series(frame, 'Close', 'yahoo', symbol)
            columns.append(fetch_with_retry(fetch, 'yahoo', symbol))
    return align_prices(columns, start, end, 'yahoo')


def tiingo_prices(start, end):
    key = os.environ.get('TIINGO_API_KEY', '').strip()
    if not key:
        raise ProviderError('tiingo', 'missing_api_key', phase='configuration')
    columns = []
    # Official endpoint with header authentication, fixed hosts and no redirects.
    # TLS verification and inherited system proxy settings remain enabled.
    with httpx.Client(timeout=10, follow_redirects=False) as client:
        for symbol in SYMBOLS[:-1]:
            def fetch():
                response = client.get(
                    f'https://api.tiingo.com/tiingo/daily/{symbol}/prices',
                    headers={'Authorization': f'Token {key}', 'Accept': 'application/json'},
                    params={'startDate': start.isoformat(), 'endDate': (end - timedelta(days=1)).isoformat(),
                            'resampleFreq': 'daily', 'format': 'json'},
                )
                response.raise_for_status()
                rows = response.json()
                if not isinstance(rows, list):
                    raise ProviderError('tiingo', 'invalid_payload', symbol, 'parse')
                frame = pd.DataFrame(rows)
                if frame.empty:
                    raise ProviderError('tiingo', 'empty_dataset', symbol, 'parse')
                if 'date' not in frame:
                    raise ProviderError('tiingo', 'missing_dates', symbol, 'parse')
                # No substitution of raw close when adjusted data is unavailable.
                frame = frame.set_index('date')
                return adjusted_series(frame, 'adjClose', 'tiingo', symbol)
            columns.append(fetch_with_retry(fetch, 'tiingo', symbol))
    return align_prices(columns, start, end, 'tiingo')
