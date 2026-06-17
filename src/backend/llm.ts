import type { AiGenerateResponse, AiStatusResponse } from "../../types/api.js";

const DEFAULT_BASE_URL = "https://api.deepseek.com";
const DEFAULT_MODEL = "deepseek-v4-flash";
const DEFAULT_TIMEOUT = 60;
const DEFAULT_MAX_TOKENS = 1800;
const DEFAULT_TEMPERATURE = 0.4;

export class LlmConfigError extends Error {}
export class LlmRequestError extends Error {}

function parseIntEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseFloatEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function envConfig() {
  const apiKey = (process.env.DEEPSEEK_API_KEY ?? "").trim();
  return {
    configured: Boolean(apiKey),
    apiKey,
    baseUrl: (process.env.DEEPSEEK_BASE_URL ?? DEFAULT_BASE_URL).trim().replace(/\/+$/, ""),
    model: (process.env.DEEPSEEK_MODEL ?? DEFAULT_MODEL).trim(),
    timeout: parseIntEnv(process.env.DEEPSEEK_TIMEOUT, DEFAULT_TIMEOUT),
    maxTokens: parseIntEnv(process.env.DEEPSEEK_MAX_TOKENS, DEFAULT_MAX_TOKENS),
    temperature: parseFloatEnv(process.env.DEEPSEEK_TEMPERATURE, DEFAULT_TEMPERATURE)
  };
}

export function aiStatus(): AiStatusResponse {
  const cfg = envConfig();
  return {
    configured: cfg.configured,
    provider: "DeepSeek",
    model: cfg.model,
    base_url: cfg.baseUrl,
    max_tokens: cfg.maxTokens,
    temperature: cfg.temperature,
    required_env: "DEEPSEEK_API_KEY"
  };
}

function buildMessages(payload: Record<string, string>) {
  const mode = (payload.mode || "doc").trim() || "doc";
  const prompt = (payload.prompt || "").trim();
  if (!prompt) throw new Error("请先填写生成要求");
  const modeInstruction: Record<string, string> = {
    doc: "生成一份结构完整、可直接保存的 Markdown 文档。",
    plan: "生成一份可执行的学习计划，包含目标、任务表、验收方式和风险调整。",
    log: "生成一段适合追加到学习日志的 Markdown 内容，优先使用表格和要点。",
    review: "生成一份复盘内容，覆盖完成情况、问题、原因、调整和下一步。",
    polish: "在保留事实的前提下润色当前 Markdown，使表达更清晰、结构更适合长期维护。",
    tasks: "把输入拆解成可执行任务清单，包含优先级、预计用时、产出物和依赖。"
  };
  const userParts = [
    `生成类型：${mode}`,
    `当前分类：${payload.section || "未指定"}`,
    `当前文件：${payload.path || "未选择"}`,
    `用户要求：${prompt}`
  ];
  if (payload.context) {
    userParts.push("当前上下文：");
    userParts.push(payload.context.slice(0, 12000));
  }
  return [
    {
      role: "system",
      content: `你是一个严谨的学习路线和项目管理助手。只输出 Markdown 正文，不要输出寒暄、代码围栏或无关解释。${modeInstruction[mode] ?? "生成高质量 Markdown 内容。"}`
    },
    { role: "user", content: userParts.join("\n\n") }
  ];
}

function summarizeError(detail: string): string {
  try {
    const payload = JSON.parse(detail) as { error?: { message?: string } };
    return String(payload.error?.message ?? detail).slice(0, 240);
  } catch {
    return detail.slice(0, 240);
  }
}

export async function generateMarkdown(payload: Record<string, string>): Promise<AiGenerateResponse> {
  const cfg = envConfig();
  if (!cfg.apiKey) {
    throw new LlmConfigError("未配置 DEEPSEEK_API_KEY，请先在启动服务的终端中设置环境变量");
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), cfg.timeout * 1000);
  try {
    const response = await fetch(`${cfg.baseUrl}/chat/completions`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: buildMessages(payload),
        thinking: { type: "disabled" },
        stream: false,
        max_tokens: cfg.maxTokens,
        temperature: cfg.temperature
      })
    });
    const body = await response.text();
    if (!response.ok) throw new LlmRequestError(`DeepSeek API 返回 ${response.status}：${summarizeError(body)}`);
    const data = JSON.parse(body) as { model?: string; choices?: Array<{ message?: { content?: string } }>; usage?: unknown };
    const content = data.choices?.[0]?.message?.content;
    if (!content) throw new LlmRequestError("DeepSeek API 返回格式异常");
    return {
      ok: true,
      provider: "DeepSeek",
      model: data.model ?? cfg.model,
      content: content.trim(),
      usage: data.usage ?? {}
    };
  } catch (error) {
    if (error instanceof LlmRequestError || error instanceof LlmConfigError) throw error;
    throw new LlmRequestError(error instanceof Error ? error.message : "DeepSeek API 请求失败");
  } finally {
    clearTimeout(timer);
  }
}
