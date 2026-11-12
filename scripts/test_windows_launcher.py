"""Portable checks; Win32 console/process behavior requires local Windows testing."""
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import socket
import subprocess
import threading
import unittest
from unittest.mock import Mock, patch
import windows_launcher as launcher


class LauncherTests(unittest.TestCase):
    def test_occupied_port_is_refused_without_stopping_listener(self):
        with socket.socket() as listener:
            listener.bind(('127.0.0.1', 0))
            listener.listen()
            with self.assertRaisesRegex(RuntimeError, 'occupied or unavailable'):
                launcher.require_free_port(listener.getsockname()[1])
            with socket.create_connection(listener.getsockname(), timeout=1):
                pass

    def test_free_port_can_be_checked_without_retaining_it(self):
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', 0))
            port = probe.getsockname()[1]
        launcher.require_free_port(port)
        with socket.socket() as probe:
            probe.bind(('127.0.0.1', port))

    def test_readiness_checks_real_http_and_rejects_broken_proxy(self):
        class Handler(BaseHTTPRequestHandler):
            broken = False

            def do_GET(self):
                if self.path == '/':
                    body = b'<script type="module" src="/src/main.jsx"></script>'
                elif self.path == '/api/health':
                    body = json.dumps({'status': 'ok', 'database': 'connected'}).encode()
                else:
                    body = b'<html>bad proxy</html>' if self.broken else json.dumps({'history': [1], 'holdings': [1]}).encode()
                self.send_response(200)
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args):
                pass

        server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            base = f'http://127.0.0.1:{server.server_port}'
            launcher.check_frontend(base)
            Handler.broken = True
            with self.assertRaises(ValueError):
                launcher.check_frontend(base)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_failed_child_aborts_readiness(self):
        process = Mock(returncode=1)
        process.poll.return_value = 1
        with self.assertRaisesRegex(RuntimeError, 'backend exited'):
            launcher.wait_ready(Mock(), [('backend', process)])

    def test_timeout_reports_last_health_error(self):
        with patch.object(launcher.time, 'monotonic', side_effect=[0, 0, 2]), patch.object(launcher.time, 'sleep'):
            with self.assertRaisesRegex(RuntimeError, 'timed out: broken proxy'):
                launcher.wait_ready(Mock(side_effect=ValueError('broken proxy')), [], timeout=1)

    def test_shutdown_signals_only_owned_live_processes(self):
        live, exited = Mock(pid=1234), Mock(pid=5678)
        live.poll.return_value = None
        exited.poll.return_value = 0
        with patch.object(launcher.signal, 'CTRL_BREAK_EVENT', 21, create=True), patch.object(launcher.subprocess, 'run') as kill:
            launcher.stop_owned([('backend', live), ('frontend', exited)])
            live.send_signal.assert_called_once_with(21)
            live.wait.assert_called_once_with(timeout=30)
            exited.send_signal.assert_not_called()
            kill.assert_not_called()

    def test_forced_shutdown_targets_owned_tree_not_port_or_image(self):
        live = Mock(pid=1234)
        live.poll.return_value = None
        live.wait.side_effect = subprocess.TimeoutExpired('backend', 30)
        with patch.object(launcher.signal, 'CTRL_BREAK_EVENT', 21, create=True), patch.object(launcher.subprocess, 'run', return_value=Mock(returncode=0)) as kill:
            launcher.stop_owned([('backend', live)])
            self.assertEqual(kill.call_args.args[0], ['taskkill.exe', '/PID', '1234', '/T', '/F'])


if __name__ == '__main__':
    unittest.main()
