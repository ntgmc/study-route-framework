from __future__ import annotations

import argparse
import json
import mimetypes
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

from .config import STATIC_DIR, UI_DIR
from .llm import LlmConfigError, LlmRequestError, ai_status, generate_markdown
from .markdown_store import (
    archive_file,
    create_file,
    get_file,
    list_markdown_files,
    rename_file,
    repo_summary,
    save_file,
    search_files,
    update_dashboard_focus,
    append_daily_log,
)


class StudyGuiHandler(BaseHTTPRequestHandler):
    server_version = "StudyRouteGUI/2.0"

    def do_GET(self) -> None:
        try:
            parsed = urlparse(self.path)
            if parsed.path == "/":
                self.send_file(UI_DIR / "index.html")
                return
            if parsed.path.startswith("/static/"):
                self.send_static(parsed.path.removeprefix("/static/"))
                return
            if parsed.path == "/api/summary":
                self.send_json(repo_summary())
                return
            if parsed.path == "/api/files":
                query = parse_qs(parsed.query)
                section = query.get("section", ["dashboard"])[0]
                keyword = query.get("q", [""])[0]
                sort = query.get("sort", ["updated"])[0]
                self.send_json({"files": list_markdown_files(section, keyword, sort)})
                return
            if parsed.path == "/api/file":
                path = parse_qs(parsed.query).get("path", [""])[0]
                self.send_json(get_file(path))
                return
            if parsed.path == "/api/search":
                query = parse_qs(parsed.query).get("q", [""])[0]
                self.send_json({"results": search_files(query)})
                return
            if parsed.path == "/api/ai/status":
                self.send_json(ai_status())
                return
            self.send_error_json(HTTPStatus.NOT_FOUND, "接口不存在")
        except Exception as exc:
            self.send_error_json(HTTPStatus.BAD_REQUEST, str(exc))

    def do_POST(self) -> None:
        try:
            parsed = urlparse(self.path)
            payload = self.read_json()
            if parsed.path == "/api/file":
                self.send_json(save_file(str(payload.get("path", "")), str(payload.get("content", ""))))
                return
            if parsed.path == "/api/create":
                self.send_json(
                    create_file(
                        str(payload.get("section", "")),
                        str(payload.get("title", "")),
                        str(payload.get("name", "")),
                    ),
                    HTTPStatus.CREATED,
                )
                return
            if parsed.path == "/api/rename":
                self.send_json(rename_file(str(payload.get("path", "")), str(payload.get("name", ""))))
                return
            if parsed.path == "/api/archive":
                self.send_json(archive_file(str(payload.get("path", ""))))
                return
            if parsed.path == "/api/dashboard/focus":
                self.send_json(update_dashboard_focus({key: str(value) for key, value in payload.items()}))
                return
            if parsed.path == "/api/logs/daily":
                self.send_json(append_daily_log({key: str(value) for key, value in payload.items()}))
                return
            if parsed.path == "/api/ai/generate":
                self.send_json(generate_markdown({key: str(value) for key, value in payload.items()}))
                return
            self.send_error_json(HTTPStatus.NOT_FOUND, "接口不存在")
        except LlmConfigError as exc:
            self.send_error_json(HTTPStatus.PRECONDITION_REQUIRED, str(exc))
        except LlmRequestError as exc:
            self.send_error_json(HTTPStatus.BAD_GATEWAY, str(exc))
        except Exception as exc:
            self.send_error_json(HTTPStatus.BAD_REQUEST, str(exc))

    def read_json(self) -> dict[str, Any]:
        length = int(self.headers.get("Content-Length", "0"))
        raw = self.rfile.read(length).decode("utf-8")
        return json.loads(raw) if raw else {}

    def send_file(self, path: Path) -> None:
        if not path.exists() or not path.is_file():
            self.send_error_json(HTTPStatus.NOT_FOUND, "文件不存在")
            return
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        body = path.read_bytes()
        self.send_response(HTTPStatus.OK)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_static(self, name: str) -> None:
        path = (STATIC_DIR / name).resolve()
        if STATIC_DIR.resolve() not in path.parents:
            self.send_error_json(HTTPStatus.NOT_FOUND, "静态资源不存在")
            return
        self.send_file(path)

    def send_json(self, payload: dict[str, Any], status: HTTPStatus = HTTPStatus.OK) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def send_error_json(self, status: HTTPStatus, message: str) -> None:
        self.send_json({"error": message}, status)

    def log_message(self, format: str, *args: Any) -> None:
        print(f"{self.address_string()} {format % args}")


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="启动 Study Route 本地 Web 管理台")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    return parser


def main() -> None:
    args = build_parser().parse_args()
    server = ThreadingHTTPServer((args.host, args.port), StudyGuiHandler)
    print(f"Study Route 管理台已启动：http://{args.host}:{args.port}")
    print("按 Ctrl+C 停止服务。")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n正在停止服务。")
    finally:
        server.server_close()
