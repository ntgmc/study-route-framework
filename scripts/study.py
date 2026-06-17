#!/usr/bin/env python3
"""Small Markdown automation helpers for this study-route repository."""

from __future__ import annotations

import argparse
import datetime as dt
from pathlib import Path
from typing import Iterable

from study_route_paths import DATA_ROOT

DEFAULT_GOAL = "goals/2026-internship-ai-backend.md"
DEFAULT_PLAN = "plans/2026-W25-project-kickoff.md"


def today() -> str:
    return dt.date.today().isoformat()


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8", newline="\n")


def parse_row(value: str, fields: int, label: str) -> list[str]:
    parts = [part.strip() for part in value.split("|")]
    if len(parts) != fields:
        raise SystemExit(f"{label} 需要 {fields} 个字段，用 | 分隔：{value}")
    return parts


def markdown_row(cells: Iterable[str]) -> str:
    cleaned = [cell.replace("\n", " ").strip() for cell in cells]
    return "| " + " | ".join(cleaned) + " |"


def log_path(date: str) -> Path:
    return DATA_ROOT / "logs" / f"{date}.md"


def render_log(date: str, status: str, hours: str, goal: str, plan: str) -> str:
    return f"""# 学习记录

## 基本信息

- 日期：{date}
- 关联目标：`{goal}`
- 关联计划：`{plan}`
- 实际学习时长：{hours}
- 今日状态：{status}

## 今日完成

| 任务 | 结果 | 用时 | 证据或产出 |
| --- | --- | ---: | --- |

## 关键收获

## 遇到的问题

| 问题 | 当前判断 | 下一步 |
| --- | --- | --- |

## 明日计划

## 备注
"""


def ensure_log(date: str, status: str, hours: str, goal: str, plan: str) -> Path:
    path = log_path(date)
    if not path.exists():
        write_text(path, render_log(date, status, hours, goal, plan))
    return path


def append_after_table(text: str, heading: str, rows: list[str]) -> str:
    if not rows:
        return text
    marker = f"## {heading}"
    start = text.find(marker)
    if start == -1:
        raise SystemExit(f"找不到章节：{marker}")
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
    for row in reversed(rows):
        lines.insert(insert_at, row)
    new_section = "\n".join(lines)
    return text[:start] + new_section + text[section_end:]


def append_bullets(text: str, heading: str, items: list[str]) -> str:
    if not items:
        return text
    marker = f"## {heading}"
    start = text.find(marker)
    if start == -1:
        raise SystemExit(f"找不到章节：{marker}")
    next_heading = text.find("\n## ", start + len(marker))
    section_end = len(text) if next_heading == -1 else next_heading
    insert = "".join(f"\n- {item.strip()}" for item in items if item.strip())
    return text[:section_end].rstrip() + insert + "\n" + text[section_end:]


def cmd_init_log(args: argparse.Namespace) -> None:
    date = args.date or today()
    path = ensure_log(date, args.status, args.hours, args.goal, args.plan)
    print(path.relative_to(DATA_ROOT))


def cmd_add_log(args: argparse.Namespace) -> None:
    date = args.date or today()
    path = ensure_log(date, args.status, args.hours, args.goal, args.plan)
    text = read_text(path)

    done_rows = [markdown_row(parse_row(item, 4, "--done")) for item in args.done]
    problem_rows = [markdown_row(parse_row(item, 3, "--problem")) for item in args.problem]

    text = append_after_table(text, "今日完成", done_rows)
    text = append_after_table(text, "遇到的问题", problem_rows)
    text = append_bullets(text, "关键收获", args.takeaway)
    text = append_bullets(text, "明日计划", args.next)
    text = append_bullets(text, "备注", args.note)

    write_text(path, text)
    print(path.relative_to(DATA_ROOT))


def ensure_leetcode_record() -> Path:
    path = DATA_ROOT / "records" / "leetcode.md"
    if not path.exists():
        write_text(
            path,
            """# LeetCode 刷题记录

| 日期 | 专题 | 题目 | 难度 | 结果 | 是否重做 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
""",
        )
    return path


def cmd_leetcode(args: argparse.Namespace) -> None:
    path = ensure_leetcode_record()
    date = args.date or today()
    row = markdown_row(
        [
            date,
            args.topic,
            args.title,
            args.difficulty,
            args.result,
            args.redo,
            args.note,
        ]
    )
    text = read_text(path).rstrip() + "\n" + row + "\n"
    write_text(path, text)
    print(path.relative_to(DATA_ROOT))


def ensure_exam_review_record() -> Path:
    path = DATA_ROOT / "records" / "exam-review.md"
    if not path.exists():
        write_text(
            path,
            """# 期末复习记录

| 日期 | 科目 | 计划时长 | 实际时长 | 完成内容 | 问题 | 下一步 |
| --- | --- | ---: | ---: | --- | --- | --- |
""",
        )
    return path


def cmd_exam_review(args: argparse.Namespace) -> None:
    path = ensure_exam_review_record()
    date = args.date or today()
    row = markdown_row(
        [
            date,
            args.subject,
            args.planned,
            args.actual,
            args.done,
            args.problem,
            args.next,
        ]
    )
    text = read_text(path).rstrip() + "\n" + row + "\n"
    write_text(path, text)
    print(path.relative_to(DATA_ROOT))


def replace_focus_line(text: str, prefix: str, value: str | None) -> str:
    if not value:
        return text
    lines = text.splitlines()
    target = f"- {prefix}："
    for index, line in enumerate(lines):
        if line.startswith(target):
            lines[index] = f"{target}{value}"
            return "\n".join(lines) + "\n"
    raise SystemExit(f"dashboard.md 中找不到行：{target}")


def update_progress_row(text: str, spec: str, date: str) -> str:
    project, status, stage, milestone = parse_row(spec, 4, "--progress")
    lines = text.splitlines()
    for index, line in enumerate(lines):
        if line.startswith(f"| {project} |"):
            lines[index] = markdown_row([project, status, stage, milestone, date])
            return "\n".join(lines) + "\n"
    marker = "| --- | --- | --- | --- | --- |"
    for index, line in enumerate(lines):
        if line == marker:
            lines.insert(index + 1, markdown_row([project, status, stage, milestone, date]))
            return "\n".join(lines) + "\n"
    raise SystemExit("dashboard.md 中找不到进度概览表")


def cmd_dashboard(args: argparse.Namespace) -> None:
    path = DATA_ROOT / "dashboard.md"
    text = read_text(path)
    date = args.date or today()
    text = replace_focus_line(text, "当前阶段", args.stage)
    text = replace_focus_line(text, "本周重点", args.week)
    text = replace_focus_line(text, "今日任务", args.today)
    for item in args.progress:
        text = update_progress_row(text, item, date)
    write_text(path, text)
    print(path.relative_to(DATA_ROOT))


def cmd_week_plan(args: argparse.Namespace) -> None:
    week = args.week or f"{dt.date.today().isocalendar().year}-W{dt.date.today().isocalendar().week:02d}"
    path = DATA_ROOT / "plans" / f"{week}.md"
    if path.exists() and not args.force:
        raise SystemExit(f"{path.relative_to(DATA_ROOT)} 已存在；如需覆盖请加 --force")
    text = f"""# 学习计划：{week}

## 基本信息

- 计划周期：{week}
- 关联目标：`{args.goal}`
- 关联路线：`{args.route}`
- 本周期主题：{args.theme}
- 计划总时长：{args.hours}

## 本周期目标

| 目标 | 验收方式 | 优先级 |
| --- | --- | --- |

## 任务安排

| 日期 | 任务 | 预计用时 | 产出物 | 状态 |
| --- | --- | ---: | --- | --- |

## 每日最低动作

- 刷 1 道算法题，并记录解法要点。
- 学习 30 分钟后端、计算机基础或 Linux 实操。
- 在 `logs/` 中记录当天完成内容、问题和下一步。

## 重点问题

| 问题 | 解决路径 | 截止时间 |
| --- | --- | --- |

## 复盘入口

- 对应复盘文件：`reviews/{week}.md`
"""
    write_text(path, text)
    print(path.relative_to(DATA_ROOT))


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="学习路线 Markdown 自动化工具")
    sub = parser.add_subparsers(dest="command", required=True)

    init_log = sub.add_parser("init-log", help="创建某天学习日志")
    init_log.add_argument("--date")
    init_log.add_argument("--status", default="顺利")
    init_log.add_argument("--hours", default="")
    init_log.add_argument("--goal", default=DEFAULT_GOAL)
    init_log.add_argument("--plan", default=DEFAULT_PLAN)
    init_log.set_defaults(func=cmd_init_log)

    add_log = sub.add_parser("add-log", help="向某天学习日志追加内容")
    add_log.add_argument("--date")
    add_log.add_argument("--status", default="顺利")
    add_log.add_argument("--hours", default="")
    add_log.add_argument("--goal", default=DEFAULT_GOAL)
    add_log.add_argument("--plan", default=DEFAULT_PLAN)
    add_log.add_argument("--done", action="append", default=[], help="任务|结果|用时|证据或产出")
    add_log.add_argument("--takeaway", action="append", default=[])
    add_log.add_argument("--problem", action="append", default=[], help="问题|当前判断|下一步")
    add_log.add_argument("--next", action="append", default=[])
    add_log.add_argument("--note", action="append", default=[])
    add_log.set_defaults(func=cmd_add_log)

    leetcode = sub.add_parser("leetcode", help="追加 LeetCode 刷题记录")
    leetcode.add_argument("--date")
    leetcode.add_argument("--topic", required=True)
    leetcode.add_argument("--title", required=True)
    leetcode.add_argument("--difficulty", default="中等")
    leetcode.add_argument("--result", default="待复盘")
    leetcode.add_argument("--redo", default="否")
    leetcode.add_argument("--note", default="")
    leetcode.set_defaults(func=cmd_leetcode)

    exam_review = sub.add_parser("exam-review", help="追加期末复习时长记录")
    exam_review.add_argument("--date")
    exam_review.add_argument("--subject", required=True)
    exam_review.add_argument("--planned", default="")
    exam_review.add_argument("--actual", required=True)
    exam_review.add_argument("--done", default="")
    exam_review.add_argument("--problem", default="")
    exam_review.add_argument("--next", default="")
    exam_review.set_defaults(func=cmd_exam_review)

    dashboard = sub.add_parser("dashboard", help="更新 dashboard 当前焦点或进度概览")
    dashboard.add_argument("--date")
    dashboard.add_argument("--stage")
    dashboard.add_argument("--week")
    dashboard.add_argument("--today")
    dashboard.add_argument("--progress", action="append", default=[], help="项目|状态|当前阶段|下一个里程碑")
    dashboard.set_defaults(func=cmd_dashboard)

    week_plan = sub.add_parser("week-plan", help="创建周计划 Markdown")
    week_plan.add_argument("--week")
    week_plan.add_argument("--theme", default="待填写")
    week_plan.add_argument("--hours", default="待填写")
    week_plan.add_argument("--goal", default=DEFAULT_GOAL)
    week_plan.add_argument("--route", default="routes/backend-plus-ai-application-roadmap.md")
    week_plan.add_argument("--force", action="store_true")
    week_plan.set_defaults(func=cmd_week_plan)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
