import type { DocumentFrontMatter } from "../../types/domain.js";

export interface ParsedFrontMatter {
  data: DocumentFrontMatter;
  body: string;
  raw: string;
  endLine: number;
}

export interface MarkdownDocument {
  frontMatter: DocumentFrontMatter;
  body: string;
  rawFrontMatter?: string;
  frontMatterError?: string;
}

export interface MarkdownSection {
  body: string;
  startLine: number;
}

export interface MarkdownTableRow {
  cells: string[];
  line: number;
}

export interface MarkdownTaskItem {
  text: string;
  checked: boolean;
  line: number;
}

function parseScalar(value: string): string | number | boolean | string[] {
  const clean = value.trim();
  if (clean === "[]") return [];
  if (clean.startsWith("[") && clean.endsWith("]")) {
    const inner = clean.slice(1, -1).trim();
    if (!inner) return [];
    return splitCsv(inner).map((item) => stripQuotes(item.trim()));
  }
  if (clean === "true") return true;
  if (clean === "false") return false;
  if (/^-?\d+(\.\d+)?$/.test(clean)) return Number(clean);
  return stripQuotes(clean);
}

function stripQuotes(value: string): string {
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function splitCsv(value: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote = "";
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if ((char === '"' || char === "'") && value[index - 1] !== "\\") {
      quote = quote === char ? "" : quote || char;
    }
    if (char === "," && !quote) {
      parts.push(current);
      current = "";
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

function needsQuotes(value: string): boolean {
  return !value || /[#[\]{},&*!|>'"%@`\r\n]/.test(value) || /^\s|\s$/.test(value);
}

function formatScalar(value: string | number | boolean | string[] | undefined): string {
  if (Array.isArray(value)) return `[${value.map((item) => (needsQuotes(item) ? JSON.stringify(item) : item)).join(", ")}]`;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  const text = String(value ?? "");
  return needsQuotes(text) ? JSON.stringify(text) : text;
}

export function parseFrontMatter(text: string): ParsedFrontMatter | null {
  const normalized = text.replace(/\r\n/g, "\n");
  if (!normalized.startsWith("---\n")) return null;
  const lines = normalized.split("\n");
  const endIndex = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (endIndex < 0) throw new Error("Front matter is missing a closing --- line");
  const data: DocumentFrontMatter = {};
  for (let index = 1; index < endIndex; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) throw new Error(`Invalid front matter line ${index + 1}`);
    data[match[1]] = parseScalar(match[2]);
  }
  return {
    data,
    body: lines.slice(endIndex + 1).join("\n"),
    raw: lines.slice(0, endIndex + 1).join("\n"),
    endLine: endIndex + 1
  };
}

export function parseMarkdownDocument(text: string): MarkdownDocument {
  try {
    const parsed = parseFrontMatter(text);
    if (!parsed) return { frontMatter: {}, body: text };
    return { frontMatter: parsed.data, body: parsed.body, rawFrontMatter: parsed.raw };
  } catch (error) {
    return {
      frontMatter: {},
      body: text,
      frontMatterError: error instanceof Error ? error.message : "Invalid front matter"
    };
  }
}

export function serializeFrontMatter(data: DocumentFrontMatter): string {
  const ordered = [
    "id",
    "type",
    "schema_version",
    "title",
    "created",
    "updated",
    "tags",
    "status",
    "favorite",
    "pinned",
    "target_date",
    "goal_id",
    "route_id",
    "week",
    "plan_id",
    "date",
    "period",
    "record_type",
    "resource_type",
    "url",
    "subject",
    "exam_date"
  ];
  const keys = [
    ...ordered.filter((key) => data[key] !== undefined),
    ...Object.keys(data).filter((key) => !ordered.includes(key) && data[key] !== undefined).sort()
  ];
  return `---\n${keys.map((key) => `${key}: ${formatScalar(data[key])}`).join("\n")}\n---\n`;
}

export function replaceFrontMatter(text: string, data: DocumentFrontMatter): string {
  const parsed = parseFrontMatter(text);
  const body = parsed ? parsed.body.replace(/^\n/, "") : text;
  return `${serializeFrontMatter(data)}\n${body.replace(/^\n+/, "")}`;
}

export function extractMarkdownTitle(text: string, fallback: string): string {
  const document = parseMarkdownDocument(text);
  for (const line of document.body.split(/\r?\n/)) {
    const clean = line.trim();
    if (clean.startsWith("#")) return clean.replace(/^#+/, "").trim() || fallback;
  }
  return typeof document.frontMatter.title === "string" && document.frontMatter.title.trim()
    ? document.frontMatter.title.trim()
    : fallback;
}

export function sectionBody(text: string, heading: string): MarkdownSection | null {
  const document = parseMarkdownDocument(text);
  const frontMatterLines = text === document.body ? 0 : text.slice(0, text.length - document.body.length).split(/\r?\n/).length - 1;
  const lines = document.body.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (headingIndex < 0) return null;
  const endIndex = lines.findIndex((line, index) => index > headingIndex && /^##\s+/.test(line.trim()));
  return {
    body: lines.slice(headingIndex + 1, endIndex < 0 ? lines.length : endIndex).join("\n"),
    startLine: frontMatterLines + headingIndex + 2
  };
}

export function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  const cells: string[] = [];
  let current = "";
  for (let index = 0; index < trimmed.length; index += 1) {
    const char = trimmed[index];
    if (char === "|" && trimmed[index - 1] !== "\\") {
      cells.push(cleanCell(current));
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(cleanCell(current));
  return cells;
}

export function cleanCell(value: string): string {
  return value.trim().replace(/\\\|/g, "|").replace(/^`|`$/g, "").trim();
}

export function isTableSeparator(line: string): boolean {
  return /^\|\s*:?-+/.test(line.trim());
}

export function tableRows(text: string, heading: string): MarkdownTableRow[] {
  const section = sectionBody(text, heading);
  if (!section) return [];
  const lines = section.body.split(/\r?\n/);
  const rows: MarkdownTableRow[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line.startsWith("|") || isTableSeparator(line)) continue;
    const next = lines[index + 1]?.trim() ?? "";
    if (isTableSeparator(next)) continue;
    rows.push({ cells: splitTableRow(line), line: section.startLine + index });
  }
  return rows;
}

export function taskItems(text: string, heading: string): MarkdownTaskItem[] {
  const section = sectionBody(text, heading);
  if (!section) return [];
  return section.body
    .split(/\r?\n/)
    .map((line, index) => {
      const match = line.match(/^\s*-\s*(\[[ xX]\]\s*)?(.*)$/);
      if (!match) return null;
      return {
        text: cleanCell(match[2] ?? ""),
        checked: /\[[xX]\]/.test(match[1] ?? ""),
        line: section.startLine + index
      };
    })
    .filter((item): item is MarkdownTaskItem => Boolean(item));
}
