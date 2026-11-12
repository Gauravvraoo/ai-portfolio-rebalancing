"""Yahoo Finance via yfinance: adjusted historical closes, never streaming quotes.

Cache raw aligned market closes; CASH stays at 1 in snapshots. The execution
engine accrues the separately configured cash yield once per observed transition.
"""
from datetime import date, datetime, timezone
import os
from pathlib import Path
import threading
import time
from typing import Literal
import numpy as np
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict
from app.rl.data import load_data, manifest, SYMBOLS
from app.rl.storage import read, write

CACHE_ROOT = Path(os.getenv('PORTFOLIO_MARKET_CACHE_DIR', str(Path(__file__).resolve().parents[2] / 'data' / 'market_cache')))
TTL = 6 * 3600
COOLDOWN = 60
lock = threading.Lock()
failures = {}


class DataSelection(BaseModel):
    model_config = ConfigDict(extra='forbid')
    data_source: Literal['synthetic', 'real'] = 'synthetic'
    data_range: Literal['1Y', '3Y', '5Y'] = '3Y'


def source_of(data):
    # Existing artifacts predate the source field and are synthetic, never real.
    return data.get('data_source', 'synthetic')


def download_prices(start, end):
    import pandas as pd
    import yfinance as yf
    yf.set_tz_cache_location(str(CACHE_ROOT / "provider"))
    columns = []
    for symbol in SYMBOLS[:-1]:
        frame = yf.Ticker(symbol).history(
            start=start.isoformat(), end=end.isoformat(), interval='1d',
            auto_adjust=True, actions=False, raise_errors=True, timeout=10,
        )
        if frame.empty or 'Close' not in frame:
            raise ValueError(f'No adjusted daily prices returned for {symbol}')
        series = frame['Close'].copy()
        series.index = pd.Index([d.date().isoformat() for d in series.index])
        if series.index.has_duplicates:
            raise ValueError(f'Duplicate trading dates for {symbol}')
        columns.append(series.rename(symbol))
    # Intersection of observed sessions; no forward/backfill or invented quotes.
    aligned = pd.concat(columns, axis=1, join='inner').sort_index().dropna()
    aligned = aligned.loc[(aligned.index >= start.isoformat()) & (aligned.index < end.isoformat())]
    prices = aligned.to_numpy(dtype=np.float64)
    if len(aligned) < 150 or not np.isfinite(prices).all() or (prices <= 0).any():
        raise ValueError('Need at least 150 aligned, finite positive daily closes for all four ETFs')
    return np.array(aligned.index, dtype='<U10'), np.column_stack((prices, np.ones(len(prices))))


def dataset(selection, refresh=False):
    if selection.data_source == 'synthetic':
        dates, prices = load_data()
        return dates, prices, manifest(dates, prices)
    with lock:
        CACHE_ROOT.mkdir(parents=True, exist_ok=True)
        path = CACHE_ROOT / selection.data_range
        meta_path = path.with_suffix('.json')
        npz_path = path.with_suffix('.npz')
        cached = None
        try:
            cached = read(meta_path)
            age = time.time() - cached['fetched_epoch']
            if age < TTL and (not refresh or age < COOLDOWN):
                with np.load(npz_path, allow_pickle=False) as data:
                    dates, prices = data['dates'].copy(), data['prices'].copy()
                if manifest(dates, prices)['sha256'] == cached['sha256']:
                    return dates, prices, {**cached, 'cache_hit': True}
        except (OSError, ValueError, KeyError):
            pass  # Invalid cache requires a fresh provider request, not demo substitution.
        previous = failures.get(selection.data_range)
        if previous and time.time() - previous[0] < COOLDOWN:
            raise HTTPException(previous[1], previous[2], headers={'Retry-After': str(COOLDOWN)})
        today = datetime.now(timezone.utc).date()
        years = int(selection.data_range[0])
        try:
            start = today.replace(year=today.year - years)
        except ValueError:
            start = date(today.year - years, 2, 28)
        end = today  # Exclude the current UTC day to avoid partial daily bars.
        try:
            dates, prices = download_prices(start, end)
        except Exception as exc:
            limited = 'rate' in str(exc).lower() or '429' in str(exc)
            code = 429 if limited else 503
            message = ('Yahoo Finance rate limit reached' if limited else 'Yahoo Finance historical prices unavailable') + '. Retry later or explicitly select Synthetic Demo. No synthetic fallback was used.'
            failures[selection.data_range] = (time.time(), code, message)
            raise HTTPException(code, message, headers={'Retry-After': str(COOLDOWN)}) from exc
        meta = manifest(dates, prices, {
            'data_source': 'real', 'provider': 'Yahoo Finance via yfinance',
            'data_range': selection.data_range,
            'label': 'Adjusted historical daily ETF prices from Yahoo Finance; not live or real-time streaming. ESG scores are illustrative, not verified ratings.',
            'price_adjustment': 'yfinance auto_adjust=True: split/dividend-adjusted Close',
            'requested_start': start.isoformat(), 'requested_end_exclusive': end.isoformat(),
            'fetched_at': datetime.now(timezone.utc).isoformat(), 'fetched_epoch': time.time(),
            'last_trading_date': str(dates[-1]), 'quote_timestamp': None,
            'calendar_alignment': 'Intersection of observed daily closes; incomplete rows dropped; no filling',
            'cache_ttl_seconds': TTL, 'cache_hit': False,
        })
        temp = npz_path.with_suffix('.tmp.npz')
        np.savez_compressed(temp, dates=dates, prices=prices)
        temp.replace(npz_path)
        write(meta_path, meta)
        failures.pop(selection.data_range, None)
        return dates, prices, meta
