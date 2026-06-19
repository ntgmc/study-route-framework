import type { FileDocument, FileMeta, RepoSummary, SectionKey, SortMode } from "./domain.js";

export interface ApiErrorResponse {
  error: string;
}

export type SummaryResponse = RepoSummary;

export interface FilesRequest {
  section: SectionKey;
  q?: string;
  sort?: SortMode;
}

export interface FilesResponse {
  files: FileMeta[];
}

export interface SearchResponse {
  results: FileMeta[];
}

export type FileResponse = FileDocument;

export interface SaveFileRequest {
  path: string;
  content: string;
}

export interface SaveFileResponse {
  ok: true;
  meta: FileMeta;
  backup?: string;
}

export interface CreateFileRequest {
  section: SectionKey;
  title: string;
  name: string;
}

export interface CreateFileResponse {
  ok: true;
  meta: FileMeta;
}

export interface RenameFileRequest {
  path: string;
  name: string;
}

export interface ArchiveFileRequest {
  path: string;
}

export interface ArchiveFileResponse {
  ok: true;
  archived_to: string;
}

export interface DashboardFocusRequest {
  main_goal?: string;
  stage?: string;
  week?: string;
  today?: string;
}

export interface DashboardFocusResponse {
  ok: true;
  backup: string;
  focus: Record<string, string>;
}

export interface DailyLogRequest {
  date?: string;
  task?: string;
  result?: string;
  hours?: string;
  evidence?: string;
  takeaway?: string;
  next?: string;
}

export interface DailyLogResponse {
  ok: true;
  path: string;
  backup: string;
  meta: FileMeta;
}

export interface CreatePlanFromRouteRequest {
  routePath: string;
  week?: string;
}

export interface CreatePlanFromRouteResponse {
  ok: true;
  path: string;
  existed: boolean;
  meta: FileMeta;
}

export interface CreateLogFromPlanRequest {
  planPath: string;
  date?: string;
}

export interface CreateLogFromPlanResponse {
  ok: true;
  path: string;
  existed: boolean;
  backup?: string;
  meta: FileMeta;
}

export interface CreateReviewFromPlanRequest {
  planPath: string;
  week?: string;
}

export interface CreateReviewFromPlanResponse {
  ok: true;
  path: string;
  existed: boolean;
  meta: FileMeta;
}

export interface ApplyRouteAdjustmentRequest {
  routePath: string;
  suggestion: string;
  reason?: string;
  date?: string;
}

export interface ApplyRouteAdjustmentResponse {
  ok: true;
  path: string;
  backup: string;
  meta: FileMeta;
}

export type AiProviderId = "deepseek" | "openai" | "openrouter" | "siliconflow" | "custom" | "ollama" | "lmstudio";
export type AiConfigSource = "environment" | "workspace" | "default" | "disabled";

export interface AiWorkspaceSettings {
  enabled: boolean;
  provider: AiProviderId;
  baseUrl: string;
  model: string;
  timeout: number;
  maxTokens: number;
  temperature: number;
}

export interface AiProviderOption {
  id: AiProviderId;
  label: string;
  local_provider: boolean;
  api_key_required: boolean;
  api_key_env: string;
  base_url_env: string;
  model_env: string;
  default_base_url: string;
  default_model: string;
}

export interface AiSettingsResponse {
  settings: AiWorkspaceSettings;
  saved_settings: Partial<AiWorkspaceSettings>;
  providers: AiProviderOption[];
  config_source: AiConfigSource;
  env_overrides: string[];
  required_key_env: string;
  api_key_detected: boolean;
}

export type SaveAiSettingsRequest = Partial<AiWorkspaceSettings>;

export interface SaveAiSettingsResponse extends AiSettingsResponse {
  ok: true;
}

export interface AiStatusResponse {
  enabled: boolean;
  configured: boolean;
  provider: string;
  provider_id: string;
  model: string;
  base_url: string;
  max_tokens: number;
  temperature: number;
  required_env: string;
  disabled_reason?: string;
  local_provider: boolean;
  settings: AiWorkspaceSettings;
  config_source: AiConfigSource;
  env_overrides: string[];
  required_key_env: string;
  api_key_detected: boolean;
  context_limits: {
    prompt_chars: number;
    context_chars: number;
  };
  sends_context_fields: string[];
}

export interface AiGenerateRequest {
  mode: string;
  prompt: string;
  section: string;
  path: string;
  context: string;
}

export interface AiGenerateResponse {
  ok: true;
  provider: string;
  model: string;
  content: string;
  usage: unknown;
}

export interface AttachmentUploadResponse {
  ok: true;
  path: string;
  markdown: string;
  size: number;
  mime_type: string;
}
