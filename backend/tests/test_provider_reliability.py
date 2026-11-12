"""Safe provider diagnostics and legitimate provider contracts (no external data claims)."""
from datetime import date
import json
import logging
from unittest.mock import Mock

import httpx
import numpy as np
import pandas as pd
import pytest
from fastapi.testclient import TestClient
from app import database
from app.main import app
from app.market_data import providers, service
from app.market_data.diagnostics import MarketDataHTTPError
from app.rl.data import load_data
from app.rl import storage
from app.backtesting import jobs as backtests


@pytest.fixture(autouse=True)
def isolated_settings(tmp_path, monkeypatch):
    for name in ('MARKET_DATA_PROVIDER', 'MARKET_DATA_FALLBACK_PROVIDER', 'TIINGO_API_KEY'):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.setattr(service, 'CACHE_ROOT', tmp_path / 'cache')
    monkeypatch.setattr(service, 'failures', {})
    monkeypatch.setattr(service, 'provider_cooldowns', {})
    monkeypatch.setattr(database, 'DB_PATH', tmp_path / 'portfolio.db')
    monkeypatch.setattr(storage, 'ROOT', tmp_path / 'experiments')
    monkeypatch.setattr(backtests, 'ROOT', tmp_path / 'backtests')


@pytest.fixture
def client():
    with TestClient(app) as client:
        yield client


def test_structured_errors_redact_proxy_key_and_raw_response(client, monkeypatch, caplog):
    secret = 'DO-NOT-LOG-TEST-KEY'
    monkeypatch.setenv('TIINGO_API_KEY', secret)
    monkeypatch.setenv('HTTPS_PROXY', f'http://testuser:{secret}@proxy.example:8080')
    def fail(*args):
        raise ConnectionError(f'CONNECT tunnel failed response 403 proxy http://testuser:{secret}@proxy.example:8080')
    monkeypatch.setattr(service, 'download_prices', fail)
    with caplog.at_level(logging.WARNING):
        response = client.get('/api/market?data_source=real')
    assert response.status_code == 503
    payload = response.json()
    record = payload['diagnostics']
    assert record['failures'][0]['code'] == 'proxy_denied'
    assert record['failures'][0]['http_status'] == 403
    assert record['request_id'] in payload['detail']
    assert record['proxy_variables_present']['HTTPS_PROXY'] is True
    diagnostic = client.get('/api/market/diagnostics').json()
    assert diagnostic['tiingo_key_present'] is True
    for output in (response.text, caplog.text, json.dumps(diagnostic)):
        assert secret not in output and 'testuser' not in output and 'proxy.example' not in output
    assert 'historical_market_data_failure' in caplog.text


@pytest.mark.parametrize('exc,code', [
    (RuntimeError('HTTP 403 forbidden'), 'access_denied'),
    (RuntimeError('HTTP 407 proxy credentials'), 'proxy_authentication'),
    (RuntimeError('429 Too Many Requests'), 'rate_limited'),
    (RuntimeError('SSL certificate verify failed'), 'tls_error'),
    (TimeoutError('operation timed out'), 'timeout'),
])
def test_error_classification(exc, code):
    assert providers.classify(exc, 'yahoo', 'SPY').code == code


def test_transient_retries_once_but_not_access_or_rate_denials(monkeypatch):
    sleep = Mock()
    monkeypatch.setattr(providers.time, 'sleep', sleep)
    fetch = Mock(side_effect=[TimeoutError('timed out'), 'success'])
    assert providers.fetch_with_retry(fetch, 'yahoo', 'SPY') == 'success'
    assert fetch.call_count == 2
    sleep.assert_called_once_with(.5)
    for code in ('access_denied', 'rate_limited', 'tls_error', 'empty_dataset'):
        fetch = Mock(side_effect=providers.ProviderError('yahoo', code, 'SPY'))
        with pytest.raises(providers.ProviderError):
            providers.fetch_with_retry(fetch, 'yahoo', 'SPY')
        assert fetch.call_count == 1


def test_tiingo_success_uses_authenticated_adjusted_prices_and_no_cash_ticker(monkeypatch):
    index = pd.bdate_range('2024-01-01', periods=200)
    urls = []
    def handler(request):
        urls.append(request.url)
        assert request.headers['Authorization'] == 'Token TEST-NOT-A-REAL-KEY'
        assert 'TEST-NOT-A-REAL-KEY' not in str(request.url)
        assert request.url.params['endDate'] == '2024-12-31'
        rows = [{'date': d.isoformat() + 'Z', 'close': 900, 'adjClose': float(i + 100)} for i, d in enumerate(index)]
        if '/AGG/' in str(request.url): rows.pop(5)
        return httpx.Response(200, json=rows)
    monkeypatch.setenv('TIINGO_API_KEY', 'TEST-NOT-A-REAL-KEY')
    real_client = httpx.Client
    monkeypatch.setattr(providers.httpx, 'Client', lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs))
    dates, prices = providers.tiingo_prices(date(2024,1,1), date(2025,1,1))
    assert len(urls) == 4 and all('CASH' not in str(url) for url in urls)
    assert len(dates) == 199
    assert prices[0,0] == 100  # adjClose, never raw close=900
    assert np.all(prices[:,4] == 1)


@pytest.mark.parametrize('payload,code', [
    ([], 'empty_dataset'),
    ([{'date': '2024-01-02', 'close': 100}], 'missing_adjusted_close'),
    ([{'date': '2024-01-02', 'adjClose': None}], 'missing_prices'),
    ([{'date': '2024-01-02', 'adjClose': 0}], 'invalid_prices'),
    ([{'date': '2024-01-02', 'adjClose': 100}], 'insufficient_history'),
    ({'detail': 'account error'}, 'invalid_payload'),
])
def test_tiingo_rejects_empty_missing_and_unadjusted_data(monkeypatch, payload, code):
    monkeypatch.setenv('TIINGO_API_KEY', 'TEST-ONLY')
    real_client = httpx.Client
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json=payload))
    monkeypatch.setattr(providers.httpx, 'Client', lambda **kwargs: real_client(transport=transport, **kwargs))
    with pytest.raises(providers.ProviderError) as error:
        providers.tiingo_prices(date(2024,1,1), date(2025,1,1))
    assert error.value.code == code


@pytest.mark.parametrize('status,code', [(401,'access_denied'), (403,'access_denied'), (429,'rate_limited')])
def test_tiingo_access_and_rate_errors_are_not_retried(monkeypatch, status, code):
    monkeypatch.setenv('TIINGO_API_KEY', 'TEST-ONLY')
    requests = []
    def handler(request):
        requests.append(request)
        return httpx.Response(status, text='Sensitive response body must not be logged')
    real_client = httpx.Client
    monkeypatch.setattr(providers.httpx, 'Client', lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs))
    with pytest.raises(providers.ProviderError) as error:
        providers.tiingo_prices(date(2024,1,1), date(2025,1,1))
    assert error.value.code == code
    assert len(requests) == 1


def test_configured_fallback_is_visible_and_cached_without_mixing_providers(client, monkeypatch):
    dates, prices = load_data()
    yahoo_calls, tiingo_calls = [], []
    def yahoo(*args):
        yahoo_calls.append(1)
        raise providers.ProviderError('yahoo', 'access_denied', 'SPY', http_status=403)
    def tiingo(*args):
        tiingo_calls.append(1)
        return dates, prices
    monkeypatch.setattr(service, 'download_prices', yahoo)
    monkeypatch.setattr(service, 'tiingo_prices', tiingo)
    # No configured fallback means no alternative request.
    assert client.get('/api/market?data_source=real').status_code == 503
    assert tiingo_calls == []
    monkeypatch.setenv('MARKET_DATA_FALLBACK_PROVIDER', 'tiingo')
    response = client.get('/api/market?data_source=real')
    assert response.status_code == 200
    data = response.json()['data']
    assert data['fallback_used'] is True and data['provider_id'] == 'tiingo'
    assert data['fallback_reason']['code'] == 'access_denied'
    assert data['price_adjustment'].startswith('Tiingo adjClose')
    assert client.get('/api/market?data_source=real').json()['data']['cache_hit'] is True
    assert len(tiingo_calls) == 1
    assert (service.CACHE_ROOT / 'yahoo-tiingo-3Y.json').exists()
    monkeypatch.setenv('MARKET_DATA_PROVIDER', 'tiingo')
    monkeypatch.delenv('MARKET_DATA_FALLBACK_PROVIDER')
    assert client.get('/api/market?data_source=real').status_code == 200
    assert len(tiingo_calls) == 2  # Distinct provider policy, never serve Yahoo namespace.


def test_missing_key_and_invalid_provider_are_actionable(client, monkeypatch):
    monkeypatch.setenv('MARKET_DATA_PROVIDER', 'tiingo')
    response = client.get('/api/market?data_source=real')
    assert response.status_code == 503
    assert response.json()['diagnostics']['failures'][0]['code'] == 'missing_api_key'
    assert 'TIINGO_API_KEY' in response.json()['detail']
    monkeypatch.setenv('MARKET_DATA_PROVIDER', 'https://bad.example/SECRET')
    response = client.get('/api/market?data_source=real')
    assert response.json()['diagnostics']['failures'][0]['code'] == 'invalid_configuration'
    assert 'SECRET' not in response.text and 'bad.example' not in response.text


def test_fallback_failure_preserves_both_safe_diagnostics(client, monkeypatch):
    monkeypatch.setenv('MARKET_DATA_FALLBACK_PROVIDER', 'tiingo')
    def yahoo(*args): raise providers.ProviderError('yahoo', 'access_denied', 'SPY', http_status=403)
    monkeypatch.setattr(service, 'download_prices', yahoo)
    response = client.get('/api/market?data_source=real')
    assert response.status_code == 503
    assert [e['code'] for e in response.json()['diagnostics']['failures']] == ['access_denied', 'missing_api_key']
    assert client.get('/api/market?data_source=synthetic').status_code == 200


def test_yahoo_bootstrap_exceptions_are_enabled_and_restored(monkeypatch, tmp_path):
    import yfinance as yf
    previous = yf.config.debug.hide_exceptions
    class Ticker:
        def __init__(self, symbol):
            assert yf.config.debug.hide_exceptions is False
            raise RuntimeError('403 forbidden')
    monkeypatch.setattr(yf, 'Ticker', Ticker)
    with pytest.raises(providers.ProviderError) as error:
        providers.yahoo_prices(date(2024,1,1), date(2025,1,1), tmp_path)
    assert error.value.code == 'access_denied'
    assert error.value.symbol == 'SPY'
    assert yf.config.debug.hide_exceptions == previous


def test_curl_zero_status_does_not_hide_proxy_connect_403():
    from types import SimpleNamespace
    error = ConnectionError('Failed to perform curl: CONNECT tunnel failed response 403')
    error.response = SimpleNamespace(status_code=0)
    classified = providers.classify(error, 'yahoo', 'SPY')
    assert classified.code == 'proxy_denied'
    assert classified.http_status == 403


def test_rate_limit_cooldown_applies_across_ranges_and_still_allows_opt_in_fallback(client, monkeypatch):
    fetch = Mock(side_effect=providers.ProviderError('yahoo', 'rate_limited', 'SPY', http_status=429))
    monkeypatch.setattr(service, 'download_prices', fetch)
    for range_ in ('1Y', '3Y', '5Y'):
        response = client.get(f'/api/market?data_source=real&data_range={range_}')
        assert response.status_code == 429
    assert fetch.call_count == 1
    dates, prices = load_data()
    monkeypatch.setenv('MARKET_DATA_FALLBACK_PROVIDER', 'tiingo')
    monkeypatch.setattr(service, 'tiingo_prices', lambda *args: (dates, prices))
    response = client.get('/api/market?data_source=real')
    assert response.status_code == 200
    assert response.json()['data']['provider_id'] == 'tiingo'
    assert fetch.call_count == 1


def test_provider_retry_after_header_is_respected(client, monkeypatch):
    response = httpx.Response(429, headers={'Retry-After': '900'}, request=httpx.Request('GET', 'https://api.tiingo.com/tiingo/daily/SPY/prices'))
    classified = providers.classify(httpx.HTTPStatusError('rate limited', request=response.request, response=response), 'tiingo', 'SPY')
    assert classified.retry_after == 900
    monkeypatch.setattr(service, 'download_prices', Mock(side_effect=classified))
    result = client.get('/api/market?data_source=real')
    assert result.status_code == 429 and result.headers['retry-after'] == '900'


def test_server_retry_after_prevents_immediate_transient_retry(monkeypatch):
    response = httpx.Response(503, headers={'Retry-After': '120'}, request=httpx.Request('GET', 'https://api.tiingo.com/tiingo/daily/SPY/prices'))
    fetch = Mock(side_effect=httpx.HTTPStatusError('unavailable', request=response.request, response=response))
    with pytest.raises(providers.ProviderError) as error:
        providers.fetch_with_retry(fetch, 'tiingo', 'SPY')
    assert fetch.call_count == 1 and error.value.retry_after == 120
