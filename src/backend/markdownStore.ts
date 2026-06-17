import fs from "node:fs";
import path from "node:path";
import type { FileDocument, FileMeta, RepoSummary, SectionKey, SortMode } from "../../types/domain.js";
import { ignoredDirs, isSectionKey, managedDirs, sectionByKey, sections } from "../shared/sections.js";
import { resolveDataConfig } from "./config.js";
import { defaultContent } from "./templates.js";

function config() {
  return resolveDataConfig();
}

export function readText(filePath: string): string {
  return fs.readFileSync(filePath, "utf8");
}

export function writeText(filePath: string, text: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, text.replace(/\r?\n/g, "\n"), "utf8");
}

function posixRelative(root: string, target: string): string {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("路径不在数据根目录内");
  }
  return rel.split(path.sep).join("/");
}

export function relativePath(target: string): string {
  return posixRelative(config().dataRoot, target);
}

function pathParts(rel: string): string[] {
  return rel.split(/[\\/]+/).filter(Boolean);
}

export function slugifyFilename(value: string): string {
  let name = value.trim().replace(/\\/g, "/").split("/").pop() ?? "";
  name = name.replace(/\s+/g, "-");
  name = name.replace(/[<>:"|?*\x00-\x1f]/g, "").replace(/^[. ]+|[. ]+$/g, "");
  if (!name) throw new Error("文件名不能为空");
  if (!name.endsWith(".md")) name += ".md";
  return name;
}

export function isManagedPath(target: string): boolean {
  let rel: string;
  try {
    rel = relativePath(target);
  } catch {
    return false;
  }
  if (rel === "dashboard.md") return true;
  if (!rel.endsWith(".md")) return false;
  const parts = pathParts(rel);
  if (!parts.length || parts.some((part) => ignoredDirs.has(part))) return false;
  return managedDirs.has(parts[0]);
}

export function resolveManaged(value: string): string {
  if (!value) throw new Error("缺少文件路径");
  const target = path.resolve(config().dataRoot, value);
  if (!isManagedPath(target)) throw new Error("路径不在可管理范围内");
  return target;
}

function sectionRoot(section: string): string {
  if (!isSectionKey(section)) throw new Error("未知分类");
  const item = sectionByKey.get(section);
  if (!item) throw new Error("未知分类");
  return path.resolve(config().dataRoot, item.path);
}

function pathSection(filePath: string): SectionKey | "unknown" {
  const rel = relativePath(filePath);
  if (rel === "dashboard.md") return "dashboard";
  const first = pathParts(rel)[0];
  const item = sections.find((section) => section.path === first);
  return item?.key ?? "unknown";
}

function walkMarkdown(base: string): string[] {
  if (!fs.existsSync(base)) return [];
  const entries = fs.readdirSync(base, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    const target = path.join(base, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMarkdown(target));
    } else if (entry.isFile() && entry.name.endsWith(".md") && isManagedPath(target)) {
      files.push(target);
    }
  }
  return files;
}

function allMarkdownFiles(): string[] {
  const { dataRoot } = config();
  const files: string[] = [];
  const dashboard = path.join(dataRoot, "dashboard.md");
  if (fs.existsSync(dashboard)) files.push(dashboard);
  for (const folder of [...managedDirs].sort()) {
    files.push(...walkMarkdown(path.join(dataRoot, folder)));
  }
  return [...new Set(files)].sort((a, b) => relativePath(a).localeCompare(relativePath(b)));
}

function formatDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function extractTitle(text: string, fallback: string): string {
  for (const line of text.split(/\r?\n/)) {
    const clean = line.trim();
    if (clean.startsWith("#")) return clean.replace(/^#+/, "").trim() || fallback;
  }
  return fallback;
}

export function extractExcerpt(text: string): string {
  const lines: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const clean = line.trim();
    if (clean && !clean.startsWith("#") && !clean.startsWith("| ---")) {
      lines.push(clean.replace(/^\|+|\|+$/g, "").trim());
    }
    if (lines.join(" ").length > 100) break;
  }
  return lines.join(" ").slice(0, 140);
}

export function fileMeta(filePath: string): FileMeta {
  const stat = fs.statSync(filePath);
  let text = "";
  try {
    text = readText(filePath);
  } catch {
    text = "";
  }
  return {
    path: relativePath(filePath),
    name: path.basename(filePath),
    title: extractTitle(text, path.basename(filePath, ".md")),
    section: pathSection(filePath),
    updated: formatDate(stat.mtime),
    size: stat.size,
    excerpt: extractExcerpt(text)
  };
}

export function listMarkdownFiles(section: string, query = "", sort: SortMode = "updated"): FileMeta[] {
  let files: string[] = [];
  if (section === "dashboard") {
    const dashboard = path.join(config().dataRoot, "dashboard.md");
    files = fs.existsSync(dashboard) ? [dashboard] : [];
  } else {
    files = walkMarkdown(sectionRoot(section));
  }
  let metas = files.map(fileMeta);
  if (query.trim()) {
    const needle = query.trim().toLocaleLowerCase();
    metas = metas.filter((item) =>
      [item.path, item.title, item.excerpt].some((value) => value.toLocaleLowerCase().includes(needle))
    );
  }
  if (sort === "name") {
    metas.sort((a, b) => a.path.localeCompare(b.path));
  } else {
    metas.sort((a, b) => b.updated.localeCompare(a.updated));
  }
  return metas;
}

export function getFile(pathValue: string): FileDocument {
  const filePath = resolveManaged(pathValue);
  return { meta: fileMeta(filePath), content: readText(filePath) };
}

export function backupFile(filePath: string): string {
  if (!fs.existsSync(filePath)) throw new Error("文件不存在");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const backup = path.join(config().dataRoot, ".backups", "study-gui", stamp, relativePath(filePath));
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(filePath, backup);
  return backup;
}

export function saveFile(pathValue: string, content: string) {
  const filePath = resolveManaged(pathValue);
  const backup = fs.existsSync(filePath) ? backupFile(filePath) : undefined;
  writeText(filePath, content);
  return {
    ok: true as const,
    meta: fileMeta(filePath),
    ...(backup ? { backup: relativePath(backup) } : {})
  };
}

export function createFile(section: string, title: string, name: string) {
  if (section === "dashboard") throw new Error("总览不能创建子文件");
  const filename = slugifyFilename(name || title);
  const filePath = path.resolve(sectionRoot(section), filename);
  if (!isManagedPath(filePath)) throw new Error("文件路径无效");
  if (fs.existsSync(filePath)) throw new Error("文件已存在");
  writeText(filePath, defaultContent(section, title || path.basename(filePath, ".md")));
  return { ok: true as const, meta: fileMeta(filePath) };
}

export function renameFile(pathValue: string, newName: string) {
  const source = resolveManaged(pathValue);
  if (path.basename(source) === "dashboard.md") throw new Error("dashboard.md 不能重命名");
  const target = path.resolve(path.dirname(source), slugifyFilename(newName));
  if (!isManagedPath(target)) throw new Error("目标路径无效");
  if (fs.existsSync(target)) throw new Error("目标文件已存在");
  fs.renameSync(source, target);
  return { ok: true as const, meta: fileMeta(target) };
}

export function archiveFile(pathValue: string) {
  const source = resolveManaged(pathValue);
  if (path.basename(source) === "dashboard.md") throw new Error("dashboard.md 不能归档");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const target = path.join(config().dataRoot, ".trash", "study-gui", stamp, relativePath(source));
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.renameSync(source, target);
  return { ok: true as const, archived_to: relativePath(target) };
}

export function searchFiles(query: string, limit = 50): FileMeta[] {
  const needle = query.trim().toLocaleLowerCase();
  if (!needle) return [];
  const results: FileMeta[] = [];
  for (const filePath of allMarkdownFiles()) {
    const text = readText(filePath);
    if (!`${relativePath(filePath)}\n${text}`.toLocaleLowerCase().includes(needle)) continue;
    let lineNo = 1;
    let snippet = extractExcerpt(text);
    text.split(/\r?\n/).some((line, index) => {
      if (line.toLocaleLowerCase().includes(needle)) {
        lineNo = index + 1;
        snippet = line.trim();
        return true;
      }
      return false;
    });
    results.push({ ...fileMeta(filePath), line: lineNo, snippet: snippet.slice(0, 180) });
    if (results.length >= limit) break;
  }
  return results;
}

export function dashboardFocus(): Record<string, string> {
  const dashboard = path.join(config().dataRoot, "dashboard.md");
  if (!fs.existsSync(dashboard)) return {};
  const values: Record<string, string> = {};
  for (const line of readText(dashboard).split(/\r?\n/)) {
    const match = line.trim().match(/^-\s*([^：:]+)[：:]\s*(.*)$/);
    if (match) values[match[1]] = match[2];
  }
  return values;
}

export function repoSummary(): RepoSummary {
  const data = config();
  const sectionSummaries = sections.map((section) => {
    const files = listMarkdownFiles(section.key);
    return { ...section, count: files.length };
  });
  const totalFiles = sectionSummaries.reduce((sum, item) => sum + item.count, 0);
  const recent = allMarkdownFiles()
    .map(fileMeta)
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .slice(0, 8);
  return {
    today: new Date().toISOString().slice(0, 10),
    dataRoot: data.dataRoot,
    frameworkRoot: data.frameworkRoot,
    dataMode: data.dataMode,
    sections: sectionSummaries,
    stats: {
      files: totalFiles,
      sections: sectionSummaries.length,
      logs: listMarkdownFiles("logs").length,
      plans: listMarkdownFiles("plans").length
    },
    focus: dashboardFocus(),
    recent
  };
}

export function replaceFocusLine(text: string, label: string, value: string): string {
  if (!value.trim()) return text;
  const target = `- ${label}：`;
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].startsWith(target)) {
      lines[index] = `${target}${value.trim()}`;
      return `${lines.join("\n").replace(/\n*$/, "")}\n`;
    }
  }
  const marker = "## 当前焦点";
  const markerIndex = lines.findIndex((line) => line.trim() === marker);
  if (markerIndex >= 0) {
    lines.splice(markerIndex + 1, 0, "", `${target}${value.trim()}`);
    return `${lines.join("\n").replace(/\n*$/, "")}\n`;
  }
  throw new Error("dashboard.md 中找不到“当前焦点”章节");
}

export function updateDashboardFocus(values: Record<string, string>) {
  const dashboard = path.join(config().dataRoot, "dashboard.md");
  let text = readText(dashboard);
  const labels: Record<string, string> = {
    main_goal: "主目标",
    stage: "当前阶段",
    week: "本周重点",
    today: "今日任务"
  };
  const backup = backupFile(dashboard);
  for (const [key, label] of Object.entries(labels)) {
    if (key in values) text = replaceFocusLine(text, label, String(values[key] ?? ""));
  }
  writeText(dashboard, text);
  return { ok: true as const, backup: relativePath(backup), focus: dashboardFocus() };
}

export function markdownRow(cells: string[]): string {
  return `| ${cells.map((cell) => cell.replace(/\r?\n/g, " ").trim()).join(" | ")} |`;
}

export function appendAfterTable(text: string, heading: string, row: string): string {
  const marker = `## ${heading}`;
  const start = text.indexOf(marker);
  if (start === -1) throw new Error(`找不到章节：${marker}`);
  const nextHeading = text.indexOf("\n## ", start + marker.length);
  const sectionEnd = nextHeading === -1 ? text.length : nextHeading;
  const section = text.slice(start, sectionEnd);
  const lines = section.split(/\r?\n/);
  let insertAt = lines.length;
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].startsWith("| ---")) {
      insertAt = index + 1;
      while (insertAt < lines.length && lines[insertAt].startsWith("|")) insertAt += 1;
      break;
    }
  }
  lines.splice(insertAt, 0, row);
  return text.slice(0, start) + lines.join("\n") + text.slice(sectionEnd);
}

export function appendBullet(text: string, heading: string, value: string): string {
  if (!value.trim()) return text;
  const marker = `## ${heading}`;
  const start = text.indexOf(marker);
  if (start === -1) throw new Error(`找不到章节：${marker}`);
  const nextHeading = text.indexOf("\n## ", start + marker.length);
  const sectionEnd = nextHeading === -1 ? text.length : nextHeading;
  return `${text.slice(0, sectionEnd).trimEnd()}\n\n- ${value.trim()}\n${text.slice(sectionEnd)}`;
}

export function ensureLog(date: string): string {
  const filePath = path.join(config().dataRoot, "logs", `${date}.md`);
  if (!fs.existsSync(filePath)) writeText(filePath, defaultContent("logs", date));
  return filePath;
}

export function appendDailyLog(payload: Record<string, string>) {
  const date = payload.date || new Date().toISOString().slice(0, 10);
  const filePath = ensureLog(date);
  const backup = backupFile(filePath);
  let text = readText(filePath);
  if (payload.task || payload.result) {
    text = appendAfterTable(
      text,
      "今日完成",
      markdownRow([payload.task ?? "", payload.result ?? "", payload.hours ?? "", payload.evidence ?? ""])
    );
  }
  if (payload.takeaway) text = appendBullet(text, "关键收获", payload.takeaway);
  if (payload.next) text = appendBullet(text, "明日计划", payload.next);
  writeText(filePath, text);
  return { ok: true as const, path: relativePath(filePath), backup: relativePath(backup), meta: fileMeta(filePath) };
}
