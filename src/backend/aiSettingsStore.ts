import fs from "node:fs";
import path from "node:path";
import type { AiActionId, AiPromptTemplate, AiProviderId, AiWorkspaceSettings } from "../../types/api.js";
import { resolveDataConfig } from "./config.js";

const SETTINGS_DIR = ".study-route";
const SETTINGS_FILE = "ai-config.json";
const PROVIDERS = new Set<AiProviderId>(["deepseek", "openai", "openrouter", "siliconflow", "custom", "ollama", "lmstudio"]);
const ACTIONS = new Set<AiActionId>([
  "inbox_to_log",
  "logs_to_weekly_review",
  "route_to_next_week_plan",
  "review_to_blockers",
  "current_file_to_tasks",
  "task_acceptance_criteria",
  "summarize_learning_evidence",
  "adjust_route_by_progress",
  "custom"
]);

export type StoredAiSettings = Partial<AiWorkspaceSettings>;

function settingsPath(): string {
  return path.join(resolveDataConfig().dataRoot, SETTINGS_DIR, SETTINGS_FILE);
}

function asString(value: unknown): string | undefined {
  return typeof value === "string" ? value.trim() : undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

function sanitizeTemplate(value: unknown, usedIds: Set<string>): AiPromptTemplate | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const rawId = asString(record.id)?.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 80);
  const prompt = asString(record.prompt)?.slice(0, 4000);
  const name = asString(record.name)?.slice(0, 80);
  const actionId = asString(record.actionId);
  if (!rawId || usedIds.has(rawId) || !name || !prompt || !actionId || !ACTIONS.has(actionId as AiActionId)) return undefined;
  usedIds.add(rawId);
  return {
    id: rawId,
    name,
    actionId: actionId as AiActionId,
    prompt,
    enabled: record.enabled !== false
  };
}

function sanitize(value: unknown): StoredAiSettings {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  const provider = asString(record.provider);
  const result: StoredAiSettings = {};
  if (typeof record.enabled === "boolean") result.enabled = record.enabled;
  if (provider && PROVIDERS.has(provider as AiProviderId)) result.provider = provider as AiProviderId;
  const baseUrl = asString(record.baseUrl);
  if (baseUrl !== undefined) result.baseUrl = baseUrl;
  const model = asString(record.model);
  if (model !== undefined) result.model = model;
  const timeout = asNumber(record.timeout);
  if (timeout !== undefined) result.timeout = Math.min(600, Math.max(1, Math.round(timeout)));
  const maxTokens = asNumber(record.maxTokens);
  if (maxTokens !== undefined) result.maxTokens = Math.min(64000, Math.max(1, Math.round(maxTokens)));
  const temperature = asNumber(record.temperature);
  if (temperature !== undefined) result.temperature = Math.min(2, Math.max(0, temperature));
  const workspacePrompt = asString(record.workspacePrompt);
  if (workspacePrompt !== undefined) result.workspacePrompt = workspacePrompt.slice(0, 4000);
  if (Array.isArray(record.promptTemplates)) {
    const usedIds = new Set<string>();
    result.promptTemplates = record.promptTemplates
      .map((item) => sanitizeTemplate(item, usedIds))
      .filter((item): item is AiPromptTemplate => Boolean(item))
      .slice(0, 50);
  }
  return result;
}

export function readAiSettings(): StoredAiSettings {
  const filePath = settingsPath();
  if (!fs.existsSync(filePath)) return {};
  return sanitize(JSON.parse(fs.readFileSync(filePath, "utf8")));
}

export function saveAiSettings(value: unknown): StoredAiSettings {
  const next = sanitize(value);
  const filePath = settingsPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}
