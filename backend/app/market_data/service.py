"""Explicit historical datasets: provider-scoped cache, safe diagnostics, opt-in fallback."""
from datetime import date, datetime, timezone
import json
import logging
import math
import os
from pathlib import Path
import threading
import time
from typing import Literal
import uuid
import zipfile

import numpy as np
from pydantic import BaseModel, ConfigDict
from app.rl.data import load_data, manifest
from app.rl.storage import read, write
from app.market_data.providers import PROVIDERS, ProviderError, classify, yahoo_prices, tiingo_prices
from app.market_data.diagnostics import MarketDataHTTPError, runtime_diagnostics

CACHE_ROOT = Path(os.getenv('PORTFOLIO_MARKET_CACHE_DIR', str(Path(__file__).resolve().parents[2] / 'data' / 'market_cache')))
TTL = 6 * 3600
COOLDOWN = 60
RATE_COOLDOWN = 300
lock = threading.Lock()
failures = {}
provider_cooldowns = {}
logger = logging.getLogger('verdant.market_data')


class DataSelection(BaseModel):
    model_config = ConfigDict(extra='forbid')
    data_source: Literal['synthetic', 'real'] = 'synthetic'
    data_range: Literal['1Y', '3Y', '5Y'] = '3Y'


def source_of(data):
    return data.get('data_source', 'synthetic')


def provider_configuration():
    primary = os.environ.get('MARKET_DATA_PROVIDER', 'yahoo').strip().lower()
    fallback = os.environ.get('MARKET_DATA_FALLBACK_PROVIDER', '').strip().lower()
    if fallback == 'none':
        fallback = ''
    if primary not in PROVIDERS or (fallback and (fallback not in PROVIDERS or fallback == primary)):
        raise ProviderError('configuration', 'invalid_configuration', phase='configuration')
    return primary, fallback


def download_prices(start, end):
    """Keep the existing adapter boundary for provider-isolated integration tests."""
    return yahoo_prices(start, end, CACHE_ROOT)


def fetch_provider(provider, start, end):
    return download_prices(start, end) if provider == 'yahoo' else tiingo_prices(start, end)


def diagnostic_record(errors, request_id, data_range):
    return {
        'request_id': request_id, 'data_range': data_range,
        'occurred_at': datetime.now(timezone.utc).isoformat(),
        'failures': [error.diagnostic() for error in errors],
        **runtime_diagnostics(),
    }


def raise_failure(errors, request_id, data_range, cache_key=None):
    diagnostic = diagnostic_record(errors, request_id, data_range)
    cooldown = max([RATE_COOLDOWN if any(error.code == 'rate_limited' for error in errors) else COOLDOWN]
                   + [error.retry_after or 0 for error in errors])
    if cache_key is not None:
        failures[cache_key] = (time.time(), cooldown, diagnostic)
    logger.warning(json.dumps({'event': 'historical_market_data_failure', **diagnostic}))
    raise MarketDataHTTPError(diagnostic, cooldown) from None


def configuration_diagnostics():
    """Safe local diagnostic endpoint; never makes an outbound request."""
    try:
        primary, fallback = provider_configuration()
        config = {'primary_provider': primary, 'fallback_provider': fallback or None}
    except ProviderError:
        config = {'configuration_error': 'invalid_configuration'}
    with lock:
        recent = [entry[2] for entry in failures.values()]
    return {**config, **runtime_diagnostics(), 'cache_ttl_seconds': TTL,
            'error_cooldown_seconds': COOLDOWN, 'rate_limit_cooldown_seconds': RATE_COOLDOWN,
            'recent_failures': recent}


def dataset(selection, refresh=False):
    if selection.data_source == 'synthetic':
        dates, prices = load_data()
        return dates, prices, manifest(dates, prices)
    request_id = str(uuid.uuid4())
    try:
        primary, fallback = provider_configuration()
    except ProviderError as exc:
        raise_failure([exc], request_id, selection.data_range)
    # Default Yahoo paths remain compatible with old valid caches. Other policies
    # get separate namespaces, so switching providers cannot serve Yahoo as Tiingo.
    policy = primary + (('-' + fallback) if fallback else '')
    cache_name = selection.data_range if policy == 'yahoo' else policy + '-' + selection.data_range
    # Adding a formerly missing key unblocks the next request immediately in-process.
    failure_key = cache_name + ('-key-present' if os.environ.get('TIINGO_API_KEY', '').strip() else '-no-key')
    with lock:
        try:
            CACHE_ROOT.mkdir(parents=True, exist_ok=True)
        except OSError:
            raise_failure([ProviderError(primary, 'cache_io_error', phase='cache')], request_id, selection.data_range)
        path = CACHE_ROOT / cache_name
        meta_path, npz_path = path.with_suffix('.json'), path.with_suffix('.npz')
        try:
            cached = read(meta_path)
            age = time.time() - cached['fetched_epoch']
            actual_provider = cached.get('provider_id', 'yahoo')
            if actual_provider in {primary, fallback} and 0 <= age < TTL and (not refresh or age < COOLDOWN):
                with np.load(npz_path, allow_pickle=False) as data:
                    dates, prices = data['dates'].copy(), data['prices'].copy()
                if manifest(dates, prices)['sha256'] == cached['sha256']:
                    return dates, prices, {**cached, 'cache_hit': True}
        except (OSError, ValueError, KeyError, EOFError, zipfile.BadZipFile):
            # Corrupt/incomplete cache needs a provider fetch; no fabricated data.
            pass
        previous = failures.get(failure_key)
        if previous and time.time() - previous[0] < previous[1]:
            remaining = max(1, math.ceil(previous[1] - (time.time() - previous[0])))
            raise MarketDataHTTPError(previous[2], remaining)
        today = datetime.now(timezone.utc).date()
        years = int(selection.data_range[0])
        try:
            start = today.replace(year=today.year - years)
        except ValueError:
            start = date(today.year - years, 2, 28)
        end = today  # No partial current-UTC-day bars.
        errors = []
        selected_provider = None
        for provider in (primary, fallback):
            if not provider:
                continue
            credential_state = bool(os.environ.get('TIINGO_API_KEY', '').strip()) if provider == 'tiingo' else False
            cooldown_key = (provider, credential_state)
            rate_limit = provider_cooldowns.get(cooldown_key)
            if rate_limit and time.time() - rate_limit[0] < max(RATE_COOLDOWN, rate_limit[1].retry_after or 0):
                original = rate_limit[1]
                errors.append(ProviderError(provider, original.code, original.symbol, phase='cooldown',
                                            http_status=original.http_status, attempts=0, retry_after=original.retry_after))
                continue
            try:
                dates, prices = fetch_provider(provider, start, end)
                selected_provider = provider
                break
            except Exception as exc:
                error = classify(exc, provider)
                errors.append(error)
                if error.code == 'rate_limited':
                    provider_cooldowns[cooldown_key] = (time.time(), error)
                # Only configured legitimate providers may be tried, never proxies,
                # scraped mirrors, alternate identities or synthetic prices.
        if selected_provider is None:
            raise_failure(errors, request_id, selection.data_range, failure_key)
        if errors:
            logger.warning(json.dumps({'event': 'historical_market_data_configured_fallback',
                                       'request_id': request_id, 'selected_provider': selected_provider,
                                       'failures': [error.diagnostic() for error in errors]}))
        provider_label, adjustment = PROVIDERS[selected_provider]
        meta = manifest(dates, prices, {
            'data_source': 'real', 'provider': provider_label, 'provider_id': selected_provider,
            'primary_provider': primary, 'fallback_used': bool(errors),
            'fallback_reason': errors[0].diagnostic() if errors else None,
            'data_range': selection.data_range,
            'label': f'Adjusted historical daily ETF prices from {provider_label}; not live or real-time streaming. ESG scores are illustrative, not verified ratings.',
            'price_adjustment': adjustment,
            'requested_start': start.isoformat(), 'requested_end_exclusive': end.isoformat(),
            'fetched_at': datetime.now(timezone.utc).isoformat(), 'fetched_epoch': time.time(),
            'last_trading_date': str(dates[-1]), 'quote_timestamp': None,
            'calendar_alignment': 'Intersection of observed daily closes; incomplete rows dropped; no filling',
            'cache_ttl_seconds': TTL, 'cache_hit': False, 'request_id': request_id,
        })
        try:
            temp = npz_path.with_suffix('.tmp.npz')
            np.savez_compressed(temp, dates=dates, prices=prices)
            temp.replace(npz_path)
            write(meta_path, meta)
        except OSError:
            raise_failure([ProviderError(selected_provider, 'cache_io_error', phase='cache')], request_id, selection.data_range)
        failures.pop(failure_key, None)
        logger.info(json.dumps({'event': 'historical_market_data_success', 'request_id': request_id,
                               'provider': selected_provider, 'observations': len(dates), 'fallback_used': bool(errors)}))
        return dates, prices, meta
