import path from "node:path";
import type { DocumentFrontMatter, DocumentType, SectionKey } from "../../types/domain.js";
import { WORKSPACE_SCHEMA_VERSION } from "../../types/domain.js";
import { isSectionKey, sections } from "../shared/sections.js";
import { extractMarkdownTitle, parseMarkdownDocument, replaceFrontMatter } from "./markdownParser.js";

const sectionTypeMap: Record<SectionKey, DocumentType> = {
  dashboard: "dashboard",
  goals: "goal",
  routes: "route",
  plans: "plan",
  logs: "log",
  reviews: "review",
  projects: "project",
  records: "record",
  resources: "resource",
  exams: "exam",
  templates: "template"
};

export function sectionToDocumentType(section: SectionKey): DocumentType {
  return sectionTypeMap[section];
}

export function sectionFromRelativePath(relPath: string): SectionKey | "unknown" {
  if (relPath === "dashboard.md") return "dashboard";
  const first = relPath.split(/[\\/]+/).filter(Boolean)[0];
  const section = sections.find((item) => item.path === first)?.key;
  return section && isSectionKey(section) ? section : "unknown";
}

export function slugForPath(relPath: string): string {
  const noExt = relPath.replace(/\\/g, "/").replace(/\.md$/i, "");
  return noExt
    .split("/")
    .filter((part) => part && part !== ".")
    .map((part) => part.toLocaleLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, ""))
    .filter(Boolean)
    .join("-");
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function inferWeek(relPath: string, title: string): string | undefined {
  const match = `${relPath} ${title}`.match(/\b\d{4}-W\d{2}\b/);
  return match?.[0];
}

function inferDate(relPath: string, title: string): string | undefined {
  const match = `${relPath} ${title}`.match(/\b\d{4}-\d{2}-\d{2}\b/);
  return match?.[0];
}

export function recommendedFrontMatter(relPath: string, title: string, existing: DocumentFrontMatter = {}): DocumentFrontMatter {
  const section = sectionFromRelativePath(relPath);
  const type = section === "unknown" ? "template" : sectionToDocumentType(section);
  const slugSource = section === "dashboard" || section === "unknown"
    ? relPath
    : relPath.replace(/^[^\\/]+[\\/]/, "");
  const date = today();
  const base: DocumentFrontMatter = {
    id: `${type}:${slugForPath(slugSource) || path.basename(relPath, ".md").toLocaleLowerCase() || "document"}`,
    type,
    schema_version: WORKSPACE_SCHEMA_VERSION,
    title,
    created: date,
    updated: date,
    tags: []
  };

  if (type === "goal") base.status = "active";
  if (type === "route") base.status = "active";
  if (type === "plan") {
    base.week = inferWeek(relPath, title);
    base.status = "active";
  }
  if (type === "log") base.date = inferDate(relPath, title);
  if (type === "review") base.period = inferWeek(relPath, title) ?? inferDate(relPath, title);
  if (type === "record") base.record_type = path.basename(relPath, ".md");
  if (type === "resource") base.resource_type = "note";

  return Object.fromEntries(
    Object.entries({ ...base, ...existing }).filter(([, value]) => value !== undefined && value !== "")
  ) as DocumentFrontMatter;
}

export function ensureRecommendedFrontMatter(text: string, relPath: string, fallbackTitle?: string): string {
  const parsed = parseMarkdownDocument(text);
  if (parsed.frontMatterError) return text;
  const title = fallbackTitle || extractMarkdownTitle(text, path.basename(relPath, ".md"));
  const next = recommendedFrontMatter(relPath, title, parsed.frontMatter);
  return replaceFrontMatter(text, next);
}
