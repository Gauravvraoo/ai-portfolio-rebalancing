"""Market statistics on aligned adjusted daily closes, not intraday quotes."""
import numpy as np
from app.database import ASSETS
from app.rl.data import SYMBOLS


def summarize(dates, prices, provenance, cash_annual_return):
    values = prices.copy()
    values[:, -1] = (1 + cash_annual_return) ** (np.arange(len(dates)) / 252)
    returns = values[1:] / values[:-1] - 1
    volatility = returns.std(axis=0, ddof=1) * np.sqrt(252) * 100
    assets = []
    for i, (symbol, name, category, esg, weight) in enumerate(ASSETS):
        assets.append({
            'symbol': symbol, 'name': name, 'category': category,
            'illustrative_esg': esg, 'default_weight': weight,
            'price': float(values[-1, i]),
            'period_return': float((values[-1, i] / values[0, i] - 1) * 100),
            'annualized_volatility': float(volatility[i]),
        })
    correlation = correlations(returns)
    return {
        'assets': assets,
        'history': [{'date': str(d), **{s: float((values[k, i] / values[0, i] - 1) * 100)
                                     for i, s in enumerate(SYMBOLS)}} for k, d in enumerate(dates)],
        'data': {**provenance, 'cash_annual_return': cash_annual_return},
        'data_label': provenance['label'], 'correlation': correlation,
        'frequency': 'daily',
    }


def correlations(returns):
    # A constant cash return has no defined correlation, even at nonzero yield.
    correlation = {}
    for i, a in enumerate(SYMBOLS):
        correlation[a] = {}
        for j, b in enumerate(SYMBOLS):
            correlation[a][b] = (float(np.corrcoef(returns[:, i], returns[:, j])[0, 1])
                                if returns[:, i].std() > 1e-12 and returns[:, j].std() > 1e-12 else None)
    return correlation
