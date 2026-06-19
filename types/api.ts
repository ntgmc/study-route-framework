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

export interface AiStatusResponse {
  configured: boolean;
  provider: string;
  provider_id: string;
  model: string;
  base_url: string;
  max_tokens: number;
  temperature: number;
  required_env: string;
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
