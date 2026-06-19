import type {
  AiGenerateRequest,
  AiGenerateResponse,
  AiStatusResponse,
  ApplyRouteAdjustmentRequest,
  ApplyRouteAdjustmentResponse,
  ArchiveFileRequest,
  ArchiveFileResponse,
  CreateLogFromPlanRequest,
  CreateLogFromPlanResponse,
  CreateFileRequest,
  CreateFileResponse,
  CreatePlanFromRouteRequest,
  CreatePlanFromRouteResponse,
  CreateReviewFromPlanRequest,
  CreateReviewFromPlanResponse,
  DailyLogRequest,
  DailyLogResponse,
  DashboardFocusRequest,
  DashboardFocusResponse,
  FileResponse,
  FilesResponse,
  RenameFileRequest,
  SaveFileRequest,
  SaveFileResponse,
  SearchResponse,
  SummaryResponse
} from "../../../types/api";

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options
  });
  const payload = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(payload.error || "请求失败");
  return payload;
}

export const client = {
  summary: () => api<SummaryResponse>("/api/summary"),
  files: (section: string, q = "", sort = "updated") =>
    api<FilesResponse>(`/api/files?${new URLSearchParams({ section, q, sort })}`),
  file: (path: string) => api<FileResponse>(`/api/file?${new URLSearchParams({ path })}`),
  search: (q: string) => api<SearchResponse>(`/api/search?${new URLSearchParams({ q })}`),
  saveFile: (body: SaveFileRequest) =>
    api<SaveFileResponse>("/api/file", { method: "POST", body: JSON.stringify(body) }),
  createFile: (body: CreateFileRequest) =>
    api<CreateFileResponse>("/api/create", { method: "POST", body: JSON.stringify(body) }),
  renameFile: (body: RenameFileRequest) =>
    api<CreateFileResponse>("/api/rename", { method: "POST", body: JSON.stringify(body) }),
  archiveFile: (body: ArchiveFileRequest) =>
    api<ArchiveFileResponse>("/api/archive", { method: "POST", body: JSON.stringify(body) }),
  saveFocus: (body: DashboardFocusRequest) =>
    api<DashboardFocusResponse>("/api/dashboard/focus", { method: "POST", body: JSON.stringify(body) }),
  appendLog: (body: DailyLogRequest) =>
    api<DailyLogResponse>("/api/logs/daily", { method: "POST", body: JSON.stringify(body) }),
  createPlanFromRoute: (body: CreatePlanFromRouteRequest) =>
    api<CreatePlanFromRouteResponse>("/api/plans/from-route", { method: "POST", body: JSON.stringify(body) }),
  createLogFromPlan: (body: CreateLogFromPlanRequest) =>
    api<CreateLogFromPlanResponse>("/api/logs/from-plan", { method: "POST", body: JSON.stringify(body) }),
  createReviewFromPlan: (body: CreateReviewFromPlanRequest) =>
    api<CreateReviewFromPlanResponse>("/api/reviews/from-plan", { method: "POST", body: JSON.stringify(body) }),
  applyRouteAdjustment: (body: ApplyRouteAdjustmentRequest) =>
    api<ApplyRouteAdjustmentResponse>("/api/routes/adjustment", { method: "POST", body: JSON.stringify(body) }),
  aiStatus: () => api<AiStatusResponse>("/api/ai/status"),
  aiGenerate: (body: AiGenerateRequest) =>
    api<AiGenerateResponse>("/api/ai/generate", { method: "POST", body: JSON.stringify(body) })
};
