export type DataMode = "demo" | "external";

export const WORKSPACE_SCHEMA_VERSION = 2;
export const API_VERSION = 1;

export type SectionKey =
  | "dashboard"
  | "goals"
  | "routes"
  | "plans"
  | "logs"
  | "reviews"
  | "projects"
  | "records"
  | "resources"
  | "exams"
  | "templates";

export interface SectionConfig {
  key: SectionKey;
  label: string;
  path: string;
  kind: "single" | "folder";
}

export interface SectionSummary extends SectionConfig {
  count: number;
}

export interface FileMeta {
  id?: string;
  path: string;
  name: string;
  title: string;
  section: SectionKey | "unknown";
  updated: string;
  size: number;
  excerpt: string;
  tags: string[];
  status?: string;
  favorite?: boolean;
  pinned?: boolean;
  line?: number;
  snippet?: string;
}

export interface ExecutionTask {
  id: string;
  title: string;
  status: string;
  priority: "high" | "medium" | "low";
  dueDate?: string;
  output?: string;
  source: FileMeta;
  sourceDetail: string;
}

export interface ExecutionRouteProgress {
  route: FileMeta;
  currentStage: string;
  currentTheme: string;
  keyTask: string;
  output: string;
  acceptance: string;
  status: string;
  nextStage?: string;
}

export interface ExecutionBlocker {
  id: string;
  problem: string;
  count: number;
  firstSeen: string;
  latestSeen: string;
  source: FileMeta;
  nextStep: string;
}

export interface ExecutionEvidence {
  id: string;
  title: string;
  kind: "log" | "review" | "file";
  source: FileMeta;
  detail: string;
}

export interface ExecutionReviewItem {
  id: string;
  plan: FileMeta;
  reviewPath: string;
  status: "missing" | "empty" | "ready";
  reason: string;
}

export interface ExecutionAdjustmentSuggestion {
  id: string;
  title: string;
  reason: string;
  action: string;
  routePath?: string;
}

export interface ExecutionSummary {
  week: string;
  activePlan?: FileMeta;
  todayTasks: ExecutionTask[];
  unfinishedTasks: ExecutionTask[];
  routeProgress: ExecutionRouteProgress[];
  blockers: ExecutionBlocker[];
  evidence: ExecutionEvidence[];
  pendingReviews: ExecutionReviewItem[];
  suggestions: ExecutionAdjustmentSuggestion[];
}

export interface RepoStats {
  files: number;
  sections: number;
  logs: number;
  plans: number;
}

export interface RepoSummary {
  today: string;
  dataRoot: string;
  frameworkRoot: string;
  dataMode: DataMode;
  workspace_schema_version: number;
  sections: SectionSummary[];
  stats: RepoStats;
  focus: Record<string, string>;
  recent: FileMeta[];
  execution: ExecutionSummary;
}

export interface FileDocument {
  meta: FileMeta;
  content: string;
}

export type SortMode = "updated" | "name";

export type DocumentType =
  | "dashboard"
  | "goal"
  | "route"
  | "plan"
  | "log"
  | "review"
  | "project"
  | "record"
  | "resource"
  | "exam"
  | "template";

export interface DocumentFrontMatter {
  id?: string;
  type?: DocumentType;
  schema_version?: number;
  title?: string;
  created?: string;
  updated?: string;
  tags?: string[];
  status?: string;
  favorite?: boolean;
  pinned?: boolean;
  target_date?: string;
  goal_id?: string;
  route_id?: string;
  week?: string;
  plan_id?: string;
  date?: string;
  period?: string;
  record_type?: string;
  resource_type?: string;
  url?: string;
  subject?: string;
  exam_date?: string;
  [key: string]: string | number | boolean | string[] | undefined;
}

export interface WorkspaceManifest {
  schema_version: number;
  created_at: string;
  updated_at: string;
  framework_version: string;
}

export type HealthSeverity = "error" | "warning" | "info";

export interface HealthIssue {
  severity: HealthSeverity;
  code: string;
  message: string;
  path?: string;
  line?: number;
}

export interface HealthStats {
  files: number;
  managed_files: number;
  attachments: number;
  orphan_attachments: number;
  duplicate_ids: number;
  broken_links: number;
}

export interface HealthReport {
  ok: boolean;
  schema_version: number;
  issues: HealthIssue[];
  stats: HealthStats;
}

export interface MigrationAction {
  path: string;
  action: "create_manifest" | "update_manifest" | "add_front_matter" | "update_front_matter" | "skip";
  message: string;
}

export interface MigrationReport {
  ok: boolean;
  dry_run: boolean;
  from_schema_version: number;
  to_schema_version: number;
  actions: MigrationAction[];
  backups: string[];
  health: HealthReport;
}

export interface DoctorCheck {
  name: string;
  ok: boolean;
  message: string;
}

export interface DoctorReport {
  ok: boolean;
  dataRoot: string;
  frameworkRoot: string;
  dataMode: DataMode;
  schema_version: number;
  checks: DoctorCheck[];
  health: HealthReport;
}
