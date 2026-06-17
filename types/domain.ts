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
}

export interface FileDocument {
  meta: FileMeta;
  content: string;
}

export type SortMode = "updated" | "name";
