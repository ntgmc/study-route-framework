export type DataMode = "demo" | "external";

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
  path: string;
  name: string;
  title: string;
  section: SectionKey | "unknown";
  updated: string;
  size: number;
  excerpt: string;
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
