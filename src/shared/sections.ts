import type { SectionConfig, SectionKey } from "../../types/domain.js";

export const sections: SectionConfig[] = [
  { key: "dashboard", label: "总览", path: ".", kind: "single" },
  { key: "goals", label: "目标", path: "goals", kind: "folder" },
  { key: "routes", label: "路线", path: "routes", kind: "folder" },
  { key: "plans", label: "计划", path: "plans", kind: "folder" },
  { key: "logs", label: "日志", path: "logs", kind: "folder" },
  { key: "reviews", label: "复盘", path: "reviews", kind: "folder" },
  { key: "projects", label: "项目", path: "projects", kind: "folder" },
  { key: "records", label: "记录", path: "records", kind: "folder" },
  { key: "resources", label: "资源", path: "resources", kind: "folder" },
  { key: "exams", label: "考试", path: "exams", kind: "folder" },
  { key: "templates", label: "模板", path: "templates", kind: "folder" }
];

export const sectionByKey = new Map<SectionKey, SectionConfig>(
  sections.map((item) => [item.key, item])
);

export const managedDirs = new Set(sections.filter((item) => item.path !== ".").map((item) => item.path));

export const ignoredDirs = new Set([".git", ".idea", ".vscode", ".backups", ".trash", "__pycache__", "node_modules", "dist"]);

export function isSectionKey(value: string): value is SectionKey {
  return sectionByKey.has(value as SectionKey);
}
