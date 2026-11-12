"""Whitelisted diagnostics only: no credentials, proxy addresses or raw exceptions."""
import importlib.metadata
import os
import platform
from fastapi import HTTPException

HELP = {
    'proxy_denied': 'The network proxy denied access (CONNECT 403). Check its allowed destinations; do not bypass the restriction.',
    'proxy_authentication': 'The network proxy requires authentication. Check your approved proxy configuration.',
    'access_denied': 'The provider refused access. Check account/key/data-plan permissions or explicitly configure another provider.',
    'rate_limited': 'The provider rate limit was reached. Wait for the Retry-After cooldown.',
    'timeout': 'The provider request timed out after one bounded retry. Check connectivity and retry later.',
    'connection_error': 'Could not connect after one bounded retry. Check connectivity and proxy settings.',
    'provider_unavailable': 'The provider returned a server error after one bounded retry. Retry later.',
    'tls_error': 'TLS certificate verification failed. Configure trusted CA certificates; do not disable verification.',
    'proxy_error': 'The configured network proxy failed. Check proxy settings without publishing their values.',
    'missing_api_key': 'Set TIINGO_API_KEY securely in the backend environment and restart the launcher. A Tiingo account with suitable data access is required.',
    'invalid_configuration': 'Use MARKET_DATA_PROVIDER=yahoo or tiingo; optional MARKET_DATA_FALLBACK_PROVIDER must name the other provider.',
    'symbol_unavailable': 'The provider does not have this ETF endpoint. Check account coverage and the requested range.',
    'unexpected_redirect': 'The provider redirected the API request. Credentials were not forwarded to another host.',
    'empty_dataset': 'The provider returned no prices for this ETF/date range.',
    'missing_adjusted_close': 'Adjusted close data is missing. Unadjusted prices will not be substituted.',
    'missing_prices': 'The adjusted price series contains no usable prices.',
    'invalid_prices': 'The provider returned invalid, nonpositive or nonfinite adjusted prices.',
    'duplicate_dates': 'The provider returned duplicate trading dates.',
    'missing_dates': 'The provider response lacks trading dates.',
    'insufficient_history': 'Fewer than 150 common trading dates remain after alignment. Check provider coverage and data-plan access.',
    'invalid_payload': 'The provider response is not the expected adjusted historical price format.',
    'provider_error': 'The provider request failed. Check the structured diagnostic code and provider settings.',
    'cache_io_error': 'The backend cannot read/write its market cache. Check PORTFOLIO_MARKET_CACHE_DIR permissions.',
}


def runtime_diagnostics():
    return {
        'python_version': platform.python_version(),
        'yfinance_version': importlib.metadata.version('yfinance'),
        'tiingo_key_present': bool(os.environ.get('TIINGO_API_KEY', '').strip()),
        'proxy_variables_present': {name: bool(os.environ.get(name)) for name in
                                    ('HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY', 'http_proxy', 'https_proxy', 'all_proxy')},
        'custom_ca_present': any(os.environ.get(name) for name in ('SSL_CERT_FILE', 'REQUESTS_CA_BUNDLE', 'CURL_CA_BUNDLE')),
    }


class MarketDataHTTPError(HTTPException):
    def __init__(self, diagnostics, retry_after):
        failures = diagnostics['failures']
        last = failures[-1]
        status = 429 if last['code'] == 'rate_limited' else 503
        summaries = '; '.join(f"{e['provider']}[{e['code']}]" + (f" {e['symbol']}" if e.get('symbol') else '') for e in failures)
        message = f"Historical market data unavailable: {summaries}. {HELP.get(last['code'], HELP['provider_error'])} Request ID: {diagnostics['request_id']}. No synthetic fallback was used."
        super().__init__(status, message, headers={'Retry-After': str(retry_after)})
        self.diagnostics = diagnostics
