from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any


DEFAULT_BASE_URL = "https://api.deepseek.com"
DEFAULT_MODEL = "deepseek-v4-flash"
DEFAULT_TIMEOUT = 60
DEFAULT_MAX_TOKENS = 1800
DEFAULT_TEMPERATURE = 0.4


class LlmConfigError(RuntimeError):
    pass


class LlmRequestError(RuntimeError):
    pass


def parse_int(value: str | None, default: int) -> int:
    if not value:
        return default
    try:
        return int(value)
    except ValueError:
        return default


def parse_float(value: str | None, default: float) -> float:
    if not value:
        return default
    try:
        return float(value)
    except ValueError:
        return default


def env_config() -> dict[str, Any]:
    api_key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    base_url = os.environ.get("DEEPSEEK_BASE_URL", DEFAULT_BASE_URL).strip().rstrip("/")
    model = os.environ.get("DEEPSEEK_MODEL", DEFAULT_MODEL).strip()
    return {
        "configured": bool(api_key),
        "api_key": api_key,
        "base_url": base_url,
        "model": model,
        "timeout": parse_int(os.environ.get("DEEPSEEK_TIMEOUT"), DEFAULT_TIMEOUT),
        "max_tokens": parse_int(os.environ.get("DEEPSEEK_MAX_TOKENS"), DEFAULT_MAX_TOKENS),
        "temperature": parse_float(os.environ.get("DEEPSEEK_TEMPERATURE"), DEFAULT_TEMPERATURE),
    }


def ai_status() -> dict[str, Any]:
    config = env_config()
    return {
        "configured": config["configured"],
        "provider": "DeepSeek",
        "model": config["model"],
        "base_url": config["base_url"],
        "max_tokens": config["max_tokens"],
        "temperature": config["temperature"],
        "required_env": "DEEPSEEK_API_KEY",
    }


def build_messages(payload: dict[str, str]) -> list[dict[str, str]]:
    mode = payload.get("mode", "doc").strip() or "doc"
    section = payload.get("section", "").strip()
    path = payload.get("path", "").strip()
    prompt = payload.get("prompt", "").strip()
    context = payload.get("context", "").strip()

    if not prompt:
        raise ValueError("请先填写生成要求")

    mode_instruction = {
        "doc": "生成一份结构完整、可直接保存的 Markdown 文档。",
        "plan": "生成一份可执行的学习计划，包含目标、任务表、验收方式和风险调整。",
        "log": "生成一段适合追加到学习日志的 Markdown 内容，优先使用表格和要点。",
        "review": "生成一份复盘内容，覆盖完成情况、问题、原因、调整和下一步。",
        "polish": "在保留事实的前提下润色当前 Markdown，使表达更清晰、结构更适合长期维护。",
        "tasks": "把输入拆解成可执行任务清单，包含优先级、预计用时、产出物和依赖。",
    }.get(mode, "生成高质量 Markdown 内容。")

    user_parts = [
        f"生成类型：{mode}",
        f"当前分类：{section or '未指定'}",
        f"当前文件：{path or '未选择'}",
        f"用户要求：{prompt}",
    ]
    if context:
        user_parts.append("当前上下文：")
        user_parts.append(context[:12000])

    return [
        {
            "role": "system",
            "content": (
                "你是一个严谨的学习路线和项目管理助手。"
                "只输出 Markdown 正文，不要输出寒暄、代码围栏或与用户无关的解释。"
                f"{mode_instruction}"
            ),
        },
        {"role": "user", "content": "\n\n".join(user_parts)},
    ]


def generate_markdown(payload: dict[str, str]) -> dict[str, Any]:
    config = env_config()
    if not config["api_key"]:
        raise LlmConfigError("未配置 DEEPSEEK_API_KEY，请先在启动服务的终端中设置环境变量")

    body: dict[str, Any] = {
        "model": config["model"],
        "messages": build_messages(payload),
        "thinking": {"type": "disabled"},
        "stream": False,
        "max_tokens": config["max_tokens"],
        "temperature": config["temperature"],
    }
    request = urllib.request.Request(
        f"{config['base_url']}/chat/completions",
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {config['api_key']}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=config["timeout"]) as response:
            response_body = response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise LlmRequestError(f"DeepSeek API 返回 {exc.code}：{summarize_error(detail)}") from exc
    except urllib.error.URLError as exc:
        raise LlmRequestError(f"无法连接 DeepSeek API：{exc.reason}") from exc
    except TimeoutError as exc:
        raise LlmRequestError("DeepSeek API 请求超时") from exc

    try:
        data = json.loads(response_body)
        content = data["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError, json.JSONDecodeError) as exc:
        raise LlmRequestError("DeepSeek API 返回格式异常") from exc

    return {
        "ok": True,
        "provider": "DeepSeek",
        "model": data.get("model", config["model"]),
        "content": str(content).strip(),
        "usage": data.get("usage", {}),
    }


def summarize_error(detail: str) -> str:
    try:
        payload = json.loads(detail)
    except json.JSONDecodeError:
        return detail[:240]
    if isinstance(payload, dict):
        error = payload.get("error")
        if isinstance(error, dict):
            return str(error.get("message") or error)[:240]
        return str(payload)[:240]
    return detail[:240]
