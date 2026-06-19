import type { FileDocument, FileMeta, HealthReport, RepoSummary, SectionKey, SortMode } from "./domain.js";

export interface ApiResponseMeta {
  api_version?: number;
}

export interface WorkspaceResponseMeta extends ApiResponseMeta {
  workspace_schema_version?: number;
}

export interface ApiErrorResponse extends ApiResponseMeta {
  error: string;
}

export type SummaryResponse = RepoSummary & ApiResponseMeta;

export interface FilesRequest {
  section: SectionKey;
  q?: string;
  sort?: SortMode;
}

export interface FilesResponse extends WorkspaceResponseMeta {
  files: FileMeta[];
}

export interface SearchResponse extends WorkspaceResponseMeta {
  results: FileMeta[];
}

export type FileResponse = FileDocument & WorkspaceResponseMeta;

export interface SaveFileRequest {
  path: string;
  content: string;
}

export interface SaveDiffSummary {
  added: number;
  removed: number;
  changed: number;
  preview: string;
}

export interface SaveFileResponse extends WorkspaceResponseMeta {
  ok: true;
  meta: FileMeta;
  backup?: string;
  diff: SaveDiffSummary;
}

export interface UpdateFileMetaRequest {
  path: string;
  tags?: string[];
  status?: string;
  favorite?: boolean;
  pinned?: boolean;
}

export interface UpdateFileMetaResponse extends WorkspaceResponseMeta {
  ok: true;
  meta: FileMeta;
  backup: string;
}

export interface CreateFileRequest {
  section: SectionKey;
  title: string;
  name: string;
}

export interface CreateFileResponse extends WorkspaceResponseMeta {
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

export interface ArchiveFileResponse extends WorkspaceResponseMeta {
  ok: true;
  archived_to: string;
}

export interface DashboardFocusRequest {
  main_goal?: string;
  stage?: string;
  week?: string;
  today?: string;
}

export interface DashboardFocusResponse extends WorkspaceResponseMeta {
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

export interface DailyLogResponse extends WorkspaceResponseMeta {
  ok: true;
  path: string;
  backup: string;
  meta: FileMeta;
}

export interface CreatePlanFromRouteRequest {
  routePath: string;
  week?: string;
}

export interface CreatePlanFromRouteResponse extends WorkspaceResponseMeta {
  ok: true;
  path: string;
  existed: boolean;
  meta: FileMeta;
}

export interface CreateLogFromPlanRequest {
  planPath: string;
  date?: string;
}

export interface CreateLogFromPlanResponse extends WorkspaceResponseMeta {
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

export interface CreateReviewFromPlanResponse extends WorkspaceResponseMeta {
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

export interface ApplyRouteAdjustmentResponse extends WorkspaceResponseMeta {
  ok: true;
  path: string;
  backup: string;
  meta: FileMeta;
}

export interface HealthResponse extends HealthReport, WorkspaceResponseMeta {}

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

export interface AiSettingsResponse extends ApiResponseMeta {
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

export interface AiStatusResponse extends ApiResponseMeta {
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

export interface AiGenerateResponse extends ApiResponseMeta {
  ok: true;
  provider: string;
  model: string;
  content: string;
  usage: unknown;
}

export interface AttachmentUploadResponse extends WorkspaceResponseMeta {
  ok: true;
  path: string;
  markdown: string;
  size: number;
  mime_type: string;
}

export interface GitChangedFile {
  path: string;
  index: string;
  workingTree: string;
}

export interface GitStatusResponse extends WorkspaceResponseMeta {
  isRepo: boolean;
  clean: boolean;
  branch?: string;
  files: GitChangedFile[];
  conflicts: GitChangedFile[];
  message?: string;
}

export interface GitCommitRequest {
  message?: string;
}

export interface GitCommitResponse extends WorkspaceResponseMeta {
  ok: true;
  committed: boolean;
  message: string;
  hash?: string;
  status: GitStatusResponse;
}
