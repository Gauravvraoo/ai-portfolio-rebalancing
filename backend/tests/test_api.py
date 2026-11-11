import csv
import io
import math
import pytest
from fastapi.testclient import TestClient
from app import database
from app.main import app

@pytest.fixture
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(database, 'DB_PATH', tmp_path / 'test.db')
    with TestClient(app) as client:
        yield client

def test_health_and_seed_idempotence(client):
    assert client.get('/api/health').json()['database'] == 'connected'
    database.initialize()
    with database.connect() as db:
        assert db.execute('select count(*) from prices').fetchone()[0] == 65
        assert db.execute('select count(*) from assets').fetchone()[0] == 5

def test_portfolio_calculated_from_csv(client):
    with database.DATA.open() as file:
        rows = list(csv.DictReader(file))
    first = {r['symbol']: float(r['price']) for r in rows if r['date']=='2023-12-31'}
    last = {r['symbol']: float(r['price']) for r in rows if r['date']=='2024-12-31'}
    weights = dict(zip(['SPY','AGG','GLD','QQQ','CASH'], [.35,.25,.15,.2,.05]))
    expected = sum(100000 * weights[s] * last[s] / first[s] for s in weights)
    d = client.get('/api/portfolio').json()
    assert d['value'] == pytest.approx(expected)
    assert d['total_return'] == pytest.approx((expected/100000-1)*100)
    assert d['history'][0]['value'] == 100000
    assert len(d['history']) == 13
    assert sum(h['current_weight'] for h in d['holdings']) == pytest.approx(1)
    assert d['esg_score'] == pytest.approx(sum(h['illustrative_esg']*h['value'] for h in d['holdings'])/expected)
    values = [sum(100000*weights[s]*float(next(r['price'] for r in rows if r['date']==p['date'] and r['symbol']==s))/first[s] for s in weights) for p in d['history']]
    returns = [b/a-1 for a,b in zip(values,values[1:])]
    mean = sum(returns)/len(returns)
    assert d['annualized_volatility'] == pytest.approx(math.sqrt(sum((x-mean)**2 for x in returns)/(len(returns)-1))*math.sqrt(12)*100)
    assert d['max_drawdown'] == pytest.approx(min((v/max(values[:i+1])-1)*100 for i,v in enumerate(values)))

def test_cash_simulation(client):
    weights = {'SPY':0,'AGG':0,'GLD':0,'QQQ':0,'CASH':1}
    d = client.post('/api/simulate',json={'weights':weights}).json()
    assert d['value'] == 100000
    assert d['total_return'] == d['annualized_volatility'] == d['max_drawdown'] == 0

@pytest.mark.parametrize('weights', [{}, {'SPY':1}, {'SPY':.5,'AGG':.5,'GLD':.5,'QQQ':0,'CASH':0}, {'SPY':-1,'AGG':1,'GLD':1,'QQQ':0,'CASH':0}])
def test_invalid_allocations(client, weights):
    assert client.post('/api/simulate',json={'weights':weights}).status_code == 422

def test_market_strategies_and_report(client):
    market = client.get('/api/market').json()
    assert len(market['assets']) == 5
    assert all(market['history'][0][s] == 0 for s in ['SPY','AGG','GLD','QQQ','CASH'])
    strategies = client.get('/api/strategies').json()
    assert len(strategies) == 3
    assert len({round(s['value'],2) for s in strategies}) == 3
    response = client.get('/api/report')
    assert response.status_code == 200
    rows = list(csv.reader(io.StringIO(response.text)))
    assert len(rows) == 15
    assert float(rows[-1][1]) == round(strategies[0]['value'],2)
    assert 'attachment' in response.headers['content-disposition']
