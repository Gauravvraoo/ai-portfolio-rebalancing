"""Windows console launcher; uses existing dependencies, never installs or kills by port."""
import errno
import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parents[1]


def require_free_port(port):
    """Check wildcard IPv4/IPv6 bindings, including listeners outside loopback."""
    for family, address in ((socket.AF_INET, '0.0.0.0'), (socket.AF_INET6, '::')):
        try:
            with socket.socket(family, socket.SOCK_STREAM) as probe:
                if hasattr(socket, 'SO_EXCLUSIVEADDRUSE'):
                    probe.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
                if family == socket.AF_INET6:
                    probe.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 1)
                probe.bind((address, port))
        except OSError as exc:
            if family == socket.AF_INET6 and exc.errno in {
                errno.EAFNOSUPPORT, errno.EADDRNOTAVAIL, errno.EPROTONOSUPPORT,
            }:
                continue
            raise RuntimeError(
                f'Port {port} is occupied or unavailable. Stop its service yourself '
                'and retry. No existing process has been stopped.'
            ) from exc


def fetch_local(url):
    # Ignore corporate HTTP proxies for these strictly local readiness probes.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(url, timeout=2) as response:
        return response.read()


def check_backend(base):
    health = json.loads(fetch_local(base + '/api/health'))
    if health.get('status') != 'ok' or health.get('database') != 'connected':
        raise ValueError('Backend database is not healthy')


def check_frontend(base):
    html = fetch_local(base).decode('utf-8')
    if '/src/main.jsx' not in html:
        raise ValueError('Port 5173 did not return the Vite application')
    check_backend(base)
    portfolio = json.loads(fetch_local(base + '/api/portfolio'))
    if not portfolio.get('history') or not portfolio.get('holdings'):
        raise ValueError('Proxied portfolio response is incomplete')


def wait_ready(check, processes, timeout=90):
    deadline = time.monotonic() + timeout
    last_error = 'No response'
    while time.monotonic() < deadline:
        for name, process in processes:
            if process.poll() is not None:
                raise RuntimeError(f'{name} exited with code {process.returncode}. Inspect its log.')
        try:
            check()
            return
        except (OSError, ValueError) as exc:
            last_error = str(exc)
        time.sleep(0.5)
    raise RuntimeError(f'Service readiness timed out: {last_error}')


def stop_owned(processes):
    # Reverse startup order; give Uvicorn time to clean up training/backtest workers.
    for name, process in reversed(processes):
        if process.poll() is not None:
            continue
        print(f'Stopping {name}...')
        try:
            process.send_signal(signal.CTRL_BREAK_EVENT)
            process.wait(timeout=30)
        except (OSError, subprocess.TimeoutExpired):
            if process.poll() is None:
                print(f'{name} did not stop gracefully; stopping its owned process tree.')
                result = subprocess.run(
                    ['taskkill.exe', '/PID', str(process.pid), '/T', '/F'],
                    capture_output=True, text=True, check=False,
                )
                if result.returncode and process.poll() is None:
                    print(f'WARNING: Could not stop {name}: {result.stderr.strip()}')


def main():
    if os.name != 'nt':
        print('ERROR: START_PROJECT.bat requires Windows. Use the README commands on Linux/macOS.')
        return 1
    import msvcrt

    processes = []
    logs = []
    try:
        node = shutil.which('node.exe')
        if not node:
            raise RuntimeError('Node.js is missing from PATH. Install Node 22+ and reopen this launcher.')
        major = int(subprocess.check_output([node, '--version'], text=True).strip().lstrip('v').split('.')[0])
        if major < 22:
            raise RuntimeError('Node.js 22+ is required.')
        if sys.version_info[:2] not in {(3, 11), (3, 12)}:
            raise RuntimeError('The existing .venv must use Python 3.11 or 3.12.')
        missing = [name for name in ('uvicorn', 'fastapi', 'numpy', 'torch', 'gymnasium', 'stable_baselines3', 'scipy')
                   if importlib.util.find_spec(name) is None]
        if missing:
            raise RuntimeError('Missing backend dependencies: ' + ', '.join(missing) + '. Follow README setup.')
        vite = ROOT / 'frontend' / 'node_modules' / 'vite' / 'bin' / 'vite.js'
        if not vite.is_file():
            raise RuntimeError('Frontend dependencies are missing. Run npm ci in frontend first.')
        require_free_port(8000)
        require_free_port(5173)
        log_dir = Path(tempfile.mkdtemp(prefix='verdant-launcher-'))
        print(f'Logs: {log_dir}', flush=True)
        env = os.environ.copy()
        env['API_PROXY_TARGET'] = 'http://127.0.0.1:8000'

        def launch(name, command, cwd):
            log = (log_dir / (name + '.log')).open('wb')
            logs.append(log)
            process = subprocess.Popen(
                command, cwd=cwd, env=env, stdin=subprocess.DEVNULL,
                stdout=log, stderr=subprocess.STDOUT,
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP,
            )
            processes.append((name, process))

        print('Starting FastAPI on 127.0.0.1:8000...')
        launch('backend', [sys.executable, '-m', 'uvicorn', 'app.main:app',
                           '--host', '127.0.0.1', '--port', '8000'], ROOT / 'backend')
        wait_ready(lambda: check_backend('http://127.0.0.1:8000'), processes)
        print('Starting Vite on localhost:5173...')
        launch('frontend', [node, str(vite), '--host', 'localhost', '--port', '5173', '--strictPort'], ROOT / 'frontend')
        wait_ready(lambda: check_frontend('http://localhost:5173'), processes)
        print('Both services are healthy. Opening http://localhost:5173', flush=True)
        try:
            opened = webbrowser.open('http://localhost:5173')
        except (OSError, webbrowser.Error):
            opened = False
        if not opened:
            print('Browser could not be opened. Open http://localhost:5173 manually.')
        print('Keep this window open. Press Q or Ctrl+C here to stop both services safely.', flush=True)
        while True:
            if msvcrt.kbhit() and msvcrt.getwch().lower() == 'q':
                break
            for name, process in processes:
                if process.poll() is not None:
                    raise RuntimeError(f'{name} stopped unexpectedly ({process.returncode}). Inspect {log_dir}.')
            time.sleep(0.2)
        return 0
    except KeyboardInterrupt:
        print('\nShutdown requested.')
        return 0
    except Exception as exc:
        print(f'ERROR: {exc}', file=sys.stderr, flush=True)
        return 1
    finally:
        # A second Ctrl+C must not interrupt cleanup halfway through.
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        stop_owned(processes)
        for log in logs:
            log.close()


if __name__ == '__main__':
    sys.exit(main())
