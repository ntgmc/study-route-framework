from __future__ import annotations

import os
from pathlib import Path


DATA_ENV_VAR = "STUDY_ROUTE_DATA_DIR"
FRAMEWORK_ROOT = Path(__file__).resolve().parents[1]


def resolve_data_root() -> tuple[Path, str]:
    configured = os.environ.get(DATA_ENV_VAR, "").strip()
    if configured:
        return Path(configured).expanduser().resolve(), "external"
    return (FRAMEWORK_ROOT / "demo-data").resolve(), "demo"


DATA_ROOT, DATA_MODE = resolve_data_root()
