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
  const first = pathParts(relPath)[0];
  const section = sections.find((item) => item.path === first)?.key;
  return section && isSectionKey(section) ? section : "unknown";
}

function pathParts(relPath: string): string[] {
  return relPath.replaceAll("\\", "/").split("/").filter(Boolean);
}

function stripMarkdownExtension(value: string): string {
  return value.toLocaleLowerCase().endsWith(".md") ? value.slice(0, -3) : value;
}

function slugPart(value: string): string {
  let output = "";
  let pendingDash = false;
  for (const char of value.toLocaleLowerCase()) {
    const isDigit = char >= "0" && char <= "9";
    const isLetter = char >= "a" && char <= "z";
    if (isDigit || isLetter) {
      if (pendingDash && output) output += "-";
      output += char;
      pendingDash = false;
    } else if (output) {
      pendingDash = true;
    }
  }
  return output;
}

export function slugForPath(relPath: string): string {
  return pathParts(stripMarkdownExtension(relPath))
    .filter((part) => part !== ".")
    .map(slugPart)
    .filter(Boolean)
    .join("-");
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function inferWeek(relPath: string, title: string): string | undefined {
  return scanToken(`${relPath} ${title}`, "week");
}

function inferDate(relPath: string, title: string): string | undefined {
  return scanToken(`${relPath} ${title}`, "date");
}

function isDigitAt(value: string, index: number): boolean {
  const char = value[index];
  return char >= "0" && char <= "9";
}

function isBoundary(value: string, index: number): boolean {
  if (index < 0 || index >= value.length) return true;
  const char = value[index].toLocaleLowerCase();
  return !((char >= "a" && char <= "z") || (char >= "0" && char <= "9"));
}

function scanToken(value: string, kind: "week" | "date"): string | undefined {
  const source = value.slice(0, 512);
  const length = kind === "week" ? 8 : 10;
  for (let index = 0; index <= source.length - length; index += 1) {
    const candidate = source.slice(index, index + length);
    const matchesWeek =
      kind === "week" &&
      isDigitAt(candidate, 0) &&
      isDigitAt(candidate, 1) &&
      isDigitAt(candidate, 2) &&
      isDigitAt(candidate, 3) &&
      candidate[4] === "-" &&
      candidate[5] === "W" &&
      isDigitAt(candidate, 6) &&
      isDigitAt(candidate, 7);
    const matchesDate =
      kind === "date" &&
      isDigitAt(candidate, 0) &&
      isDigitAt(candidate, 1) &&
      isDigitAt(candidate, 2) &&
      isDigitAt(candidate, 3) &&
      candidate[4] === "-" &&
      isDigitAt(candidate, 5) &&
      isDigitAt(candidate, 6) &&
      candidate[7] === "-" &&
      isDigitAt(candidate, 8) &&
      isDigitAt(candidate, 9);
    if ((matchesWeek || matchesDate) && isBoundary(source, index - 1) && isBoundary(source, index + length)) {
      return candidate;
    }
  }
  return undefined;
}

export function recommendedFrontMatter(relPath: string, title: string, existing: DocumentFrontMatter = {}): DocumentFrontMatter {
  const section = sectionFromRelativePath(relPath);
  const type = section === "unknown" ? "template" : sectionToDocumentType(section);
  const slugSource = section === "dashboard" || section === "unknown"
    ? relPath
    : pathParts(relPath).slice(1).join("/");
  const date = today();
  const base: DocumentFrontMatter = {
    id: `${type}:${slugForPath(slugSource) || path.basename(relPath, ".md").toLocaleLowerCase() || "document"}`,
    type,
    schema_version: WORKSPACE_SCHEMA_VERSION,
    title,
    created: date,
    updated: date,
    tags: [],
    favorite: false,
    pinned: false
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
