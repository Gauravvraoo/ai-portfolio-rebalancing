"""Provider contracts are deterministic fixtures, never passed off as Yahoo access."""
import csv
import io
import time
from types import SimpleNamespace
import numpy as np
import pandas as pd
import pytest
from fastapi import HTTPException
from fastapi.testclient import TestClient
from app import database
from app.main import app
from app.market_data import service
from app.market_data.analysis import summarize
from app.rl import storage, jobs as training
from app.rl.data import load_data, manifest, splits
from app.backtesting import jobs as backtests
from app.backtesting.config import BacktestConfig
from app.backtesting.engine import backtest


@pytest.fixture
def prices():
    dates, values = load_data()
    return dates, values


@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(database, 'DB_PATH', tmp_path / 'portfolio.db')
    monkeypatch.setattr(service, 'CACHE_ROOT', tmp_path / 'market_cache')
    monkeypatch.setattr(service, 'failures', {})
    monkeypatch.setattr(storage, 'ROOT', tmp_path / 'experiments')
    monkeypatch.setattr(backtests, 'ROOT', tmp_path / 'backtests')
    with TestClient(app) as client:
        yield client


def fixture_provider(monkeypatch, prices):
    calls = []
    def fetch(start, end):
        calls.append((start, end))
        return prices
    monkeypatch.setattr(service, 'download_prices', fetch)
    return calls


def test_yfinance_adjustment_and_calendar_intersection(tmp_path, monkeypatch):
    import yfinance as yf
    monkeypatch.setattr(service, 'CACHE_ROOT', tmp_path)
    calls = []
    index = pd.bdate_range('2024-01-01', periods=200, tz='America/New_York')
    class Ticker:
        def __init__(self, symbol): self.symbol = symbol
        def history(self, **kwargs):
            calls.append((self.symbol, kwargs))
            frame = pd.DataFrame({'Close': np.arange(200) + 100.0}, index=index)
            return frame.drop(index[5]) if self.symbol == 'AGG' else frame
    monkeypatch.setattr(yf, 'Ticker', Ticker)
    from datetime import date
    dates, prices = service.download_prices(date(2024, 1, 1), date(2025, 1, 1))
    assert len(dates) == 199
    assert '2024-01-08' not in dates
    assert prices.shape == (199, 5)
    assert np.all(prices[:, 4] == 1)
    assert [c[0] for c in calls] == ['SPY', 'AGG', 'GLD', 'QQQ']
    assert all(c[1]['auto_adjust'] is True and c[1]['interval'] == '1d' for c in calls)


def test_cache_refresh_and_cash_statistics(client, monkeypatch, prices):
    calls = fixture_provider(monkeypatch, prices)
    first = client.get('/api/market?data_source=real&data_range=1Y&cash_annual_return=0.04')
    assert first.status_code == 200
    result = first.json()
    assert result['data']['data_source'] == 'real'
    assert result['data']['price_adjustment'].startswith('yfinance auto_adjust=True')
    assert result['data']['last_trading_date'] == prices[0][-1]
    assert result['history'][0]['SPY'] == 0
    assert result['assets'][-1]['period_return'] == pytest.approx(((1.04)**((len(prices[0])-1)/252)-1)*100)
    assert result['correlation']['CASH']['SPY'] is None
    assert result['correlation']['SPY']['SPY'] == pytest.approx(1)
    # Duplicate StrictMode requests and refresh clicks within a minute share cache.
    assert client.get('/api/market?data_source=real&data_range=1Y&refresh=true').status_code == 200
    assert len(calls) == 1
    path = service.CACHE_ROOT / '1Y.json'
    meta = storage.read(path)
    meta['fetched_epoch'] -= 61
    storage.write(path, meta)
    assert client.get('/api/market?data_source=real&data_range=1Y&refresh=true').status_code == 200
    assert len(calls) == 2


@pytest.mark.parametrize('error,status', [(ValueError('Empty provider response'), 503), (RuntimeError('429 rate limit'), 429)])
def test_provider_failure_is_explicit_without_fallback(client, monkeypatch, error, status):
    calls = []
    def fail(*args):
        calls.append(1)
        raise error
    monkeypatch.setattr(service, 'download_prices', fail)
    for _ in range(2):
        response = client.get('/api/market?data_source=real')
        assert response.status_code == status
        assert response.headers['retry-after'] == '60'
        assert 'No synthetic fallback' in response.json()['detail']
    assert len(calls) == 1
    assert client.get('/api/market?data_source=synthetic').status_code == 200


def test_source_validation_and_synthetic_regression(client):
    assert client.get('/api/market?data_source=unknown').status_code == 422
    assert client.get('/api/training/data?data_source=real&data_range=2Y').status_code == 422
    assert client.get('/api/market?cash_annual_return=NaN').status_code == 422
    demo = client.get('/api/market').json()
    assert len(demo['history']) == 13
    assert demo['assets'][-1]['period_return'] == 0


def test_training_snapshots_source_and_disjoint_splits(client, monkeypatch, prices):
    fixture_provider(monkeypatch, prices)
    monkeypatch.setattr(training, 'launch', lambda *args: None)
    response = client.post('/api/training/jobs', json={'data_source': 'real', 'data_range': '5Y'})
    assert response.status_code == 202
    job = response.json()
    assert job['data']['data_source'] == 'real'
    assert job['data']['data_range'] == '5Y'
    assert job['config']['data_source'] == 'real'
    with np.load(storage.ROOT / job['id'] / 'dataset.npz') as snapshot:
        np.testing.assert_array_equal(snapshot['prices'], prices[1])
    bounds = job['data']['splits']
    assert bounds['train']['last_return_end'] < bounds['validation']['first_return_end']
    assert bounds['validation']['last_return_end'] < bounds['test']['first_return_end']
    assert job['data']['symbols'] == ['SPY', 'AGG', 'GLD', 'QQQ', 'CASH']


def test_cross_source_and_range_rejected_and_exact_snapshot_reused(client, monkeypatch, prices):
    fixture_provider(monkeypatch, prices)
    monkeypatch.setattr(training, 'launch', lambda *args: None)
    job = client.post('/api/training/jobs', json={'data_source': 'real', 'data_range': '3Y'}).json()
    path = storage.ROOT / job['id']
    job['status'] = 'trained'
    storage.write(path / 'job.json', job)
    for agent in ('profit', 'responsible'): (path / f'{agent}.zip').write_bytes(b'test placeholder, never loaded')
    for source, range_ in [('synthetic', '3Y'), ('real', '1Y')]:
        response = client.post('/api/backtests', json={'experiment_id': job['id'], 'data_source': source, 'data_range': range_})
        assert response.status_code == 409
        assert 'mismatch' in response.json()['detail']
    def forbidden(*args, **kwargs):
        raise AssertionError('Comparison must not fetch newer data')
    monkeypatch.setattr(service, 'download_prices', forbidden)
    dates, values, config, source, provenance = backtests.prepare(BacktestConfig(experiment_id=job['id'], data_source='real'))
    np.testing.assert_array_equal(values, prices[1])
    assert provenance['sha256'] == job['data']['sha256']


def test_real_backtest_worker_and_exports_preserve_provenance(client, monkeypatch, prices):
    fixture_provider(monkeypatch, prices)
    response = client.post('/api/backtests', json={'data_source': 'real', 'data_range': '1Y', 'apply_esg_to_all': True})
    assert response.status_code == 202
    identifier = response.json()['id']
    deadline = time.monotonic() + 60
    while time.monotonic() < deadline:
        job = client.get(f'/api/backtests/{identifier}').json()
        if job['status'] in ('completed', 'failed'): break
        time.sleep(.1)
    assert job['status'] == 'completed', job
    result = job['result']
    assert result['data']['data_source'] == 'real'
    assert result['data']['provider'] == 'Yahoo Finance via yfinance'
    assert len(result['results']) == 4
    assert all(s['history'][0]['date'] == result['period']['start_close'] for s in result['results'])
    exported = client.get(f'/api/backtests/{identifier}/export?format=csv&kind=history')
    row = next(csv.DictReader(io.StringIO(exported.text)))
    assert row['data_source'] == 'real'
    assert row['asset_universe'] == 'SPY|AGG|GLD|QQQ|CASH'
    assert 'NOT INVESTMENT ADVICE' in row['data_assumption']
    assert 'SYNTHETIC PRICES' not in row['data_assumption']
    assert 'cash_annual_return' in row['backtest_configuration']
    assert client.get(f'/api/backtests/{identifier}/export').json()['data'] == result['data']


def test_expired_cache_failure_never_serves_stale_or_synthetic(client, monkeypatch, prices):
    fixture_provider(monkeypatch, prices)
    assert client.get('/api/market?data_source=real').status_code == 200
    path = service.CACHE_ROOT / '3Y.json'
    meta = storage.read(path)
    meta['fetched_epoch'] -= service.TTL + 1
    storage.write(path, meta)
    def unavailable(*args): raise ConnectionError('provider offline')
    monkeypatch.setattr(service, 'download_prices', unavailable)
    response = client.get('/api/market?data_source=real')
    assert response.status_code == 503
    assert 'No synthetic fallback' in response.json()['detail']


def test_legacy_synthetic_snapshot_cannot_be_used_as_real(client, monkeypatch, prices):
    import uuid
    identifier = str(uuid.uuid4())
    path = storage.ROOT / identifier
    path.mkdir(parents=True)
    dates, values = prices
    data = manifest(dates, values)
    for field in ('data_source', 'data_range', 'provider', 'price_adjustment'):
        data.pop(field, None)
    storage.write(path / 'job.json', {'id': identifier, 'status': 'trained',
                  'config': {}, 'data': data, 'created_at': storage.now()})
    np.savez_compressed(path / 'dataset.npz', dates=dates, prices=values)
    for agent in ('profit', 'responsible'):
        (path / f'{agent}.zip').write_bytes(b'placeholder, never loaded')
    assert backtests.prepare(BacktestConfig(experiment_id=identifier))[4]['sha256'] == data['sha256']
    response = client.post('/api/backtests', json={'experiment_id': identifier, 'data_source': 'real'})
    assert response.status_code == 409
