from __future__ import annotations

from pathlib import Path

from study_route_paths import DATA_MODE, DATA_ROOT, FRAMEWORK_ROOT


PACKAGE_DIR = Path(__file__).resolve().parent
UI_DIR = PACKAGE_DIR / "ui"
STATIC_DIR = PACKAGE_DIR / "static"

SECTIONS: list[dict[str, str]] = [
    {"key": "dashboard", "label": "总览", "path": ".", "kind": "single"},
    {"key": "goals", "label": "目标", "path": "goals", "kind": "folder"},
    {"key": "routes", "label": "路线", "path": "routes", "kind": "folder"},
    {"key": "plans", "label": "计划", "path": "plans", "kind": "folder"},
    {"key": "logs", "label": "日志", "path": "logs", "kind": "folder"},
    {"key": "reviews", "label": "复盘", "path": "reviews", "kind": "folder"},
    {"key": "projects", "label": "项目", "path": "projects", "kind": "folder"},
    {"key": "records", "label": "记录", "path": "records", "kind": "folder"},
    {"key": "resources", "label": "资源", "path": "resources", "kind": "folder"},
    {"key": "exams", "label": "考试", "path": "exams", "kind": "folder"},
    {"key": "templates", "label": "模板", "path": "templates", "kind": "folder"},
]

SECTION_BY_KEY = {item["key"]: item for item in SECTIONS}
MANAGED_DIRS = {item["path"] for item in SECTIONS if item["path"] != "."}
IGNORED_DIRS = {".git", ".idea", ".vscode", ".backups", ".trash", "__pycache__"}
