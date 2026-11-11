"""Deterministic simulation services; independent of HTTP and future PPO policy code."""
import math
from app.database import connect

INITIAL_CAPITAL = 100000.0


def market():
    with connect() as db:
        assets = [dict(row) for row in db.execute("SELECT * FROM assets ORDER BY rowid")]
        prices = [dict(row) for row in db.execute("SELECT * FROM prices ORDER BY date, symbol")]
    dates = sorted({row["date"] for row in prices})
    lookup = {(row["date"], row["symbol"]): row["price"] for row in prices}
    for asset in assets:
        first = lookup[dates[0], asset["symbol"]]
        last = lookup[dates[-1], asset["symbol"]]
        asset.update(price=last, period_return=(last / first - 1) * 100)
    return assets, dates, lookup


def simulate(weights=None):
    assets, dates, prices = market()
    weights = weights or {a["symbol"]: a["default_weight"] for a in assets}
    shares = {s: INITIAL_CAPITAL * w / prices[dates[0], s] for s, w in weights.items()}
    history = []
    peak = INITIAL_CAPITAL
    for date in dates:
        value = sum(shares[s] * prices[date, s] for s in weights)
        peak = max(peak, value)
        history.append({"date": date, "value": round(value, 2), "drawdown": (value / peak - 1) * 100})
    values = [sum(shares[s] * prices[d, s] for s in weights) for d in dates]
    returns = [values[i] / values[i-1] - 1 for i in range(1, len(values))]
    mean = sum(returns) / len(returns)
    variance = sum((v - mean) ** 2 for v in returns) / (len(returns)-1)
    volatility = math.sqrt(variance) * math.sqrt(12) * 100
    final = values[-1]
    holdings = []
    for asset in assets:
        symbol = asset["symbol"]
        value = shares[symbol] * prices[dates[-1], symbol]
        holdings.append({**asset, "initial_weight": weights[symbol], "shares": shares[symbol], "value": value, "current_weight": value / final})
    return {
        "initial_capital": INITIAL_CAPITAL, "value": final,
        "profit": final - INITIAL_CAPITAL, "total_return": (final / INITIAL_CAPITAL - 1) * 100,
        "annualized_volatility": volatility,
        "max_drawdown": min(row["drawdown"] for row in history),
        "esg_score": sum(a["illustrative_esg"] * a["current_weight"] for a in holdings),
        "history": history, "holdings": holdings, "weights": weights,
        "start_date": dates[0], "end_date": dates[-1], "observations": len(dates),
        "methodology": "Buy and hold; fractional shares; $100,000 initial capital; monthly synthetic prices; no fees, taxes, dividends or interest. Volatility uses sample monthly return standard deviation × sqrt(12). Drawdown uses monthly observations. ESG is value-weighted at the end date and illustrative only.",
        "data_label": "Synthetic historical-style sample • not actual market prices",
    }
