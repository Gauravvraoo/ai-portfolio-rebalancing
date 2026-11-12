"""Explicit browser-test harness ONLY: no external Yahoo requests.

Run from the repo root: .venv/bin/python backend/scripts/run_market_fixture_server.py
All databases, caches, models and results are isolated in an OS temporary directory.
Production app startup never imports this module or enables this provider stub.
"""
import argparse
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--configured-fallback-fixture', action='store_true', help='Simulate a Yahoo denial and a successful explicitly configured Tiingo fixture; never downloads prices')
    args = parser.parse_args()
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
    with TemporaryDirectory(prefix='verdant-market-browser-') as directory:
        os.environ['MARKET_DATA_PROVIDER'] = 'yahoo'
        if args.configured_fallback_fixture:
            os.environ['MARKET_DATA_FALLBACK_PROVIDER'] = 'tiingo'
        else:
            os.environ.pop('MARKET_DATA_FALLBACK_PROVIDER', None)
        for name, subpath in [('PORTFOLIO_DB_PATH', 'portfolio.db'),
                              ('PORTFOLIO_EXPERIMENT_DIR', 'experiments'),
                              ('PORTFOLIO_BACKTEST_DIR', 'backtests'),
                              ('PORTFOLIO_MARKET_CACHE_DIR', 'cache')]:
            os.environ[name] = str(Path(directory) / subpath)
        from app.market_data import service
        from app.rl.data import load_data, manifest
        import uvicorn
        from unittest.mock import patch

        def fixture(start, end):
            dates, prices = load_data()
            # Keep distinct period sizes to exercise source/range selection.
            if (end - start).days < 400:
                return dates[-252:], prices[-252:]
            return dates, prices

        def provenance(dates, prices, metadata=None):
            data = manifest(dates, prices, metadata)
            if metadata:
                label = 'Controlled Tiingo fallback fixture (not a provider download)' if args.configured_fallback_fixture else 'Controlled provider fixture (not a Yahoo download)'
                data.update(provider=label,
                            label='Browser test fixture only; not downloaded market prices')
            return data

        print('CONTROLLED PROVIDER FIXTURE: no actual Yahoo download; artifacts are temporary.', flush=True)
        def denied(*args):
            from app.market_data.providers import ProviderError
            raise ProviderError('yahoo', 'access_denied', 'SPY', http_status=403)

        with patch.object(service, 'download_prices', denied if args.configured_fallback_fixture else fixture), patch.object(service, 'tiingo_prices', fixture), patch.object(service, 'manifest', provenance):
            uvicorn.run('app.main:app', host='127.0.0.1', port=8000)


if __name__ == '__main__':
    main()
