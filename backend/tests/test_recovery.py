"""Saved pending jobs must not permanently block a restarted demo."""
from fastapi.testclient import TestClient
from app import database
from app.main import app
from app.rl import storage
from app.backtesting import jobs


def test_restart_recovers_pending_jobs_and_preserves_completed(tmp_path, monkeypatch):
    monkeypatch.setattr(database, 'DB_PATH', tmp_path / 'portfolio.db')
    monkeypatch.setattr(storage, 'ROOT', tmp_path / 'experiments')
    monkeypatch.setattr(jobs, 'ROOT', tmp_path / 'backtests')
    for root in (storage.ROOT, jobs.ROOT):
        for state in ('queued', 'running', 'completed'):
            path = root / state / 'job.json'
            path.parent.mkdir(parents=True)
            storage.write(path, {'status': state, 'evidence': [1, 2, 3]})
    with TestClient(app) as client:
        assert client.get('/api/health').status_code == 200
        for root in (storage.ROOT, jobs.ROOT):
            for state in ('queued', 'running', 'completed'):
                result = storage.read(root / state / 'job.json')
                assert result['evidence'] == [1, 2, 3]
                assert result['status'] == ('completed' if state == 'completed' else 'failed')
                if state != 'completed':
                    assert 'API restarted' in result['error']


def test_shutdown_stops_owned_workers(tmp_path, monkeypatch):
    from app.rl import jobs as training

    class Process:
        stopped = False
        waited = False

        def poll(self):
            return 0 if self.stopped else None

        def terminate(self):
            self.stopped = True

        def wait(self, timeout=None):
            self.waited = True

    monkeypatch.setattr(database, 'DB_PATH', tmp_path / 'portfolio.db')
    monkeypatch.setattr(storage, 'ROOT', tmp_path / 'experiments')
    monkeypatch.setattr(jobs, 'ROOT', tmp_path / 'backtests')
    workers = [Process(), Process()]
    monkeypatch.setattr(training, 'processes', {'training': workers[0]})
    monkeypatch.setattr(jobs, 'processes', {'backtest': workers[1]})
    with TestClient(app):
        assert not any(p.stopped for p in workers)
    assert all(p.stopped and p.waited for p in workers)
    assert training.processes == jobs.processes == {}
