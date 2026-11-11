import json
import os
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(
    os.getenv(
        "PORTFOLIO_EXPERIMENT_DIR",
        str(Path(__file__).resolve().parents[2] / "experiments"),
    )
)


def now():
    return datetime.now(timezone.utc).isoformat()


def read(path):
    return json.loads(Path(path).read_text())


def write(path, data):
    path = Path(path)
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(data, indent=2, allow_nan=False))
    temp.replace(path)
