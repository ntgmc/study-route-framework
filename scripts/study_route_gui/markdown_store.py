from __future__ import annotations

import datetime as dt
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from .config import DATA_MODE, DATA_ROOT, FRAMEWORK_ROOT, IGNORED_DIRS, MANAGED_DIRS, SECTIONS, SECTION_BY_KEY
from .templates import default_content


@dataclass(frozen=True)
class FileMeta:
    path: str
    name: str
    title: str
    section: str
    updated: str
    size: int
    excerpt: str

    def as_dict(self) -> dict[str, Any]:
        return {
            "path": self.path,
            "name": self.name,
            "title": self.title,
            "section": self.section,
            "updated": self.updated,
            "size": self.size,
            "excerpt": self.excerpt,
        }


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def relative(path: Path) -> str:
    return path.resolve().relative_to(DATA_ROOT.resolve()).as_posix()


def slugify_filename(value: str) -> str:
    name = value.strip().replace("\\", "/").split("/")[-1]
    name = re.sub(r"\s+", "-", name)
    name = re.sub(r'[<>:"|?*\x00-\x1f]', "", name).strip(". ")
    if not name:
        raise ValueError("文件名不能为空")
    if not name.endswith(".md"):
        name += ".md"
    return name


def is_managed_path(path: Path) -> bool:
    try:
        rel = relative(path)
    except ValueError:
        return False
    if rel == "dashboard.md":
        return True
    parts = rel.split("/")
    if not parts or parts[0] in IGNORED_DIRS:
        return False
    return parts[0] in MANAGED_DIRS and rel.endswith(".md")


def resolve_managed(value: str) -> Path:
    if not value:
        raise ValueError("缺少文件路径")
    path = (DATA_ROOT / value).resolve()
    if not is_managed_path(path):
        raise ValueError("路径不在可管理范围内")
    return path


def section_root(section: str) -> Path:
    if section not in SECTION_BY_KEY:
        raise ValueError("未知分类")
    item = SECTION_BY_KEY[section]
    return (DATA_ROOT / item["path"]).resolve()


def path_section(path: Path) -> str:
    rel = relative(path)
    if rel == "dashboard.md":
        return "dashboard"
    first = rel.split("/", 1)[0]
    for item in SECTIONS:
        if item["path"] == first:
            return item["key"]
    return "unknown"


def all_markdown_files() -> list[Path]:
    files: list[Path] = []
    dashboard = DATA_ROOT / "dashboard.md"
    if dashboard.exists():
        files.append(dashboard)
    for folder in sorted(MANAGED_DIRS):
        base = DATA_ROOT / folder
        if not base.exists():
            continue
        files.extend(
            path
            for path in base.rglob("*.md")
            if is_managed_path(path) and not any(part in IGNORED_DIRS for part in path.parts)
        )
    return sorted(set(files), key=lambda item: relative(item).lower())


def list_markdown_files(section: str, query: str = "", sort: str = "updated") -> list[dict[str, Any]]:
    if section == "dashboard":
        path = DATA_ROOT / "dashboard.md"
        files = [path] if path.exists() else []
    else:
        base = section_root(section)
        files = list(base.rglob("*.md")) if base.exists() else []
        files = [path for path in files if is_managed_path(path)]

    metas = [file_meta(path) for path in files]
    if query:
        needle = query.casefold()
        metas = [
            item
            for item in metas
            if needle in item.path.casefold()
            or needle in item.title.casefold()
            or needle in item.excerpt.casefold()
        ]
    if sort == "name":
        metas.sort(key=lambda item: item.path.lower())
    else:
        metas.sort(key=lambda item: item.updated, reverse=True)
    return [item.as_dict() for item in metas]


def file_meta(path: Path) -> FileMeta:
    stat = path.stat()
    text = ""
    try:
        text = read_text(path)
    except UnicodeDecodeError:
        text = ""
    return FileMeta(
        path=relative(path),
        name=path.name,
        title=extract_title(text, path.stem),
        section=path_section(path),
        updated=dt.datetime.fromtimestamp(stat.st_mtime).strftime("%Y-%m-%d %H:%M"),
        size=stat.st_size,
        excerpt=extract_excerpt(text),
    )


def extract_title(text: str, fallback: str) -> str:
    for line in text.splitlines():
        clean = line.strip()
        if clean.startswith("#"):
            return clean.lstrip("#").strip() or fallback
    return fallback


def extract_excerpt(text: str) -> str:
    lines = []
    for line in text.splitlines():
        clean = line.strip()
        if clean and not clean.startswith("#") and not clean.startswith("| ---"):
            lines.append(clean.strip("| "))
        if len(" ".join(lines)) > 100:
            break
    return " ".join(lines)[:140]


def get_file(path_value: str) -> dict[str, Any]:
    path = resolve_managed(path_value)
    return {"meta": file_meta(path).as_dict(), "content": read_text(path)}


def backup_file(path: Path) -> Path:
    if not path.exists():
        raise ValueError("文件不存在")
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    backup = DATA_ROOT / ".backups" / "study-gui" / stamp / relative(path)
    backup.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, backup)
    return backup


def save_file(path_value: str, content: str) -> dict[str, Any]:
    path = resolve_managed(path_value)
    backup = backup_file(path) if path.exists() else None
    write_text(path, content)
    result = {"ok": True, "meta": file_meta(path).as_dict()}
    if backup:
        result["backup"] = relative(backup)
    return result


def create_file(section: str, title: str, name: str) -> dict[str, Any]:
    if section == "dashboard":
        raise ValueError("总览不能创建子文件")
    filename = slugify_filename(name or title)
    base = section_root(section)
    path = (base / filename).resolve()
    if not is_managed_path(path):
        raise ValueError("文件路径无效")
    if path.exists():
        raise ValueError("文件已存在")
    write_text(path, default_content(section, title or path.stem))
    return {"ok": True, "meta": file_meta(path).as_dict()}


def rename_file(path_value: str, new_name: str) -> dict[str, Any]:
    source = resolve_managed(path_value)
    if source.name == "dashboard.md":
        raise ValueError("dashboard.md 不能重命名")
    target = (source.parent / slugify_filename(new_name)).resolve()
    if not is_managed_path(target):
        raise ValueError("目标路径无效")
    if target.exists():
        raise ValueError("目标文件已存在")
    source.rename(target)
    return {"ok": True, "meta": file_meta(target).as_dict()}


def archive_file(path_value: str) -> dict[str, Any]:
    source = resolve_managed(path_value)
    if source.name == "dashboard.md":
        raise ValueError("dashboard.md 不能归档")
    stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
    target = DATA_ROOT / ".trash" / "study-gui" / stamp / relative(source)
    target.parent.mkdir(parents=True, exist_ok=True)
    source.rename(target)
    return {"ok": True, "archived_to": relative(target)}


def search_files(query: str, limit: int = 50) -> list[dict[str, Any]]:
    needle = query.strip().casefold()
    if not needle:
        return []
    results: list[dict[str, Any]] = []
    for path in all_markdown_files():
        text = read_text(path)
        haystack = f"{relative(path)}\n{text}".casefold()
        if needle not in haystack:
            continue
        line_no = 1
        snippet = extract_excerpt(text)
        for index, line in enumerate(text.splitlines(), start=1):
            if needle in line.casefold():
                line_no = index
                snippet = line.strip()
                break
        meta = file_meta(path).as_dict()
        meta.update({"line": line_no, "snippet": snippet[:180]})
        results.append(meta)
        if len(results) >= limit:
            break
    return results


def dashboard_focus() -> dict[str, str]:
    path = DATA_ROOT / "dashboard.md"
    if not path.exists():
        return {}
    values: dict[str, str] = {}
    for line in read_text(path).splitlines():
        match = re.match(r"^-\s*([^：:]+)[：:]\s*(.*)$", line.strip())
        if match:
            values[match.group(1)] = match.group(2)
    return values


def repo_summary() -> dict[str, Any]:
    sections = []
    total_files = 0
    for item in SECTIONS:
        files = list_markdown_files(item["key"])
        total_files += len(files)
        sections.append({**item, "count": len(files)})
    recent = sorted(
        [file_meta(path).as_dict() for path in all_markdown_files()],
        key=lambda item: item["updated"],
        reverse=True,
    )[:8]
    return {
        "today": dt.date.today().isoformat(),
        "dataRoot": str(DATA_ROOT),
        "frameworkRoot": str(FRAMEWORK_ROOT),
        "dataMode": DATA_MODE,
        "sections": sections,
        "stats": {
            "files": total_files,
            "sections": len(sections),
            "logs": len(list_markdown_files("logs")),
            "plans": len(list_markdown_files("plans")),
        },
        "focus": dashboard_focus(),
        "recent": recent,
    }


def replace_focus_line(text: str, label: str, value: str) -> str:
    if not value.strip():
        return text
    target = f"- {label}："
    lines = text.splitlines()
    for index, line in enumerate(lines):
        if line.startswith(target):
            lines[index] = f"{target}{value.strip()}"
            return "\n".join(lines) + "\n"
    marker = "## 当前焦点"
    for index, line in enumerate(lines):
        if line.strip() == marker:
            lines.insert(index + 1, f"\n{target}{value.strip()}")
            return "\n".join(lines) + "\n"
    raise ValueError("dashboard.md 中找不到“当前焦点”章节")


def update_dashboard_focus(values: dict[str, str]) -> dict[str, Any]:
    path = DATA_ROOT / "dashboard.md"
    text = read_text(path)
    labels = {
        "main_goal": "主目标",
        "stage": "当前阶段",
        "week": "本周重点",
        "today": "今日任务",
    }
    backup = backup_file(path)
    for key, label in labels.items():
        if key in values:
            text = replace_focus_line(text, label, str(values[key]))
    write_text(path, text)
    return {"ok": True, "backup": relative(backup), "focus": dashboard_focus()}


def markdown_row(cells: list[str]) -> str:
    cleaned = [cell.replace("\n", " ").strip() for cell in cells]
    return "| " + " | ".join(cleaned) + " |"


def append_after_table(text: str, heading: str, row: str) -> str:
    marker = f"## {heading}"
    start = text.find(marker)
    if start == -1:
        raise ValueError(f"找不到章节：{marker}")
    next_heading = text.find("\n## ", start + len(marker))
    section_end = len(text) if next_heading == -1 else next_heading
    section = text[start:section_end]
    lines = section.splitlines()
    insert_at = len(lines)
    for index, line in enumerate(lines):
        if line.startswith("| ---"):
            insert_at = index + 1
            while insert_at < len(lines) and lines[insert_at].startswith("|"):
                insert_at += 1
            break
    lines.insert(insert_at, row)
    return text[:start] + "\n".join(lines) + text[section_end:]


def append_bullet(text: str, heading: str, value: str) -> str:
    if not value.strip():
        return text
    marker = f"## {heading}"
    start = text.find(marker)
    if start == -1:
        raise ValueError(f"找不到章节：{marker}")
    next_heading = text.find("\n## ", start + len(marker))
    section_end = len(text) if next_heading == -1 else next_heading
    return text[:section_end].rstrip() + f"\n\n- {value.strip()}\n" + text[section_end:]


def ensure_log(date: str) -> Path:
    path = DATA_ROOT / "logs" / f"{date}.md"
    if not path.exists():
        write_text(path, default_content("logs", date))
    return path


def append_daily_log(payload: dict[str, str]) -> dict[str, Any]:
    date = payload.get("date") or dt.date.today().isoformat()
    path = ensure_log(date)
    backup = backup_file(path)
    text = read_text(path)
    if payload.get("task") or payload.get("result"):
        row = markdown_row(
            [
                payload.get("task", ""),
                payload.get("result", ""),
                payload.get("hours", ""),
                payload.get("evidence", ""),
            ]
        )
        text = append_after_table(text, "今日完成", row)
    if payload.get("takeaway"):
        text = append_bullet(text, "关键收获", payload["takeaway"])
    if payload.get("next"):
        text = append_bullet(text, "明日计划", payload["next"])
    write_text(path, text)
    return {"ok": True, "path": relative(path), "backup": relative(backup), "meta": file_meta(path).as_dict()}
