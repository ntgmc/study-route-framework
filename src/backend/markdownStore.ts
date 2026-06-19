import fs from "node:fs";
import path from "node:path";
import type {
  ExecutionAdjustmentSuggestion,
  ExecutionBlocker,
  ExecutionEvidence,
  ExecutionReviewItem,
  ExecutionRouteProgress,
  ExecutionSummary,
  ExecutionTask,
  FileDocument,
  DocumentFrontMatter,
  FileMeta,
  RepoSummary,
  SectionKey,
  SortMode
} from "../../types/domain.js";
import { ignoredDirs, isSectionKey, managedDirs, sectionByKey, sections } from "../shared/sections.js";
import { resolveDataConfig } from "./config.js";
import { ensureRecommendedFrontMatter } from "./documentModel.js";
import {
  cleanCell as parseCleanCell,
  extractMarkdownTitle,
  parseMarkdownDocument,
  replaceFrontMatter,
  sectionBody as parseSectionBody,
  tableRows as parseTableRows,
  taskItems as parseTaskItems
} from "./markdownParser.js";
import { defaultContent } from "./templates.js";
import { currentWorkspaceSchemaVersion } from "./workspace.js";

function config() {
  return resolveDataConfig();
}

export function readText(filePath: string): string {
  assertReadablePath(filePath);
  return fs.readFileSync(filePath, "utf8");
}

export function writeText(filePath: string, text: string): void {
  assertWritablePath(filePath);
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

function displayPath(target: string): string {
  try {
    return relativePath(target);
  } catch {
    const { frameworkRoot } = config();
    const frameworkTemplatesRoot = path.join(frameworkRoot, "templates");
    return `templates/${posixRelative(frameworkTemplatesRoot, target)}`;
  }
}

function pathParts(rel: string): string[] {
  return rel.replaceAll("\\", "/").split("/").filter(Boolean);
}

function hasUnsafePathChar(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 32 || code === 127 || "<>:\"|?*".includes(char)) return true;
  }
  return false;
}

function safeRelativeParts(value: string): string[] {
  const clean = value.trim();
  if (!clean || clean.length > 512 || path.isAbsolute(clean)) throw new Error("Invalid path");
  const parts = clean.replaceAll("\\", "/").split("/");
  const result: string[] = [];
  for (const part of parts) {
    if (!part || part === "." || part === ".." || part.length > 120 || hasUnsafePathChar(part)) throw new Error("Invalid path");
    result.push(part);
  }
  return result;
}

function filenameLeaf(value: string): string {
  return value.trim().replaceAll("\\", "/").split("/").filter(Boolean).pop() ?? "";
}

function sanitizeFilename(value: string): string {
  let output = "";
  let pendingDash = false;
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 32 || code === 127 || "<>:\"|?*".includes(char)) continue;
    if (char.trim() === "") {
      pendingDash = output.length > 0;
      continue;
    }
    if (pendingDash && output && !output.endsWith("-")) output += "-";
    output += char;
    pendingDash = false;
  }
  while (output.startsWith(".") || output.startsWith(" ")) output = output.slice(1);
  while (output.endsWith(".") || output.endsWith(" ")) output = output.slice(0, -1);
  return output;
}

function joinSafe(root: string, parts: string[]): string {
  return path.join(root, ...parts);
}

export function slugifyFilename(value: string): string {
  let name = sanitizeFilename(filenameLeaf(value));
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

function isFrameworkTemplatePath(target: string): boolean {
  try {
    const rel = posixRelative(frameworkTemplatesRoot(), target);
    const parts = pathParts(rel);
    return Boolean(parts.length) && !parts.some((part) => ignoredDirs.has(part)) && rel.endsWith(".md");
  } catch {
    return false;
  }
}

function isReadableManagedPath(target: string): boolean {
  return isManagedPath(target) || isFrameworkTemplatePath(target);
}

function assertReadablePath(target: string): void {
  if (!isReadableManagedPath(target)) throw new Error("Path is outside readable scope");
}

function assertWritablePath(target: string): void {
  if (!isManagedPath(target)) throw new Error("Path is outside writable scope");
}

export function resolveManaged(value: string): string {
  if (!value) throw new Error("缺少文件路径");
  const target = joinSafe(config().dataRoot, safeRelativeParts(value));
  if (!isManagedPath(target)) throw new Error("路径不在可管理范围内");
  return target;
}

function dataSectionRoot(section: string): string {
  if (!isSectionKey(section)) throw new Error("未知分类");
  const item = sectionByKey.get(section);
  if (!item) throw new Error("未知分类");
  return path.resolve(config().dataRoot, item.path);
}

function frameworkTemplatesRoot(): string {
  return path.resolve(config().frameworkRoot, "templates");
}

function sectionRoots(section: string): string[] {
  const dataRoot = dataSectionRoot(section);
  if (section !== "templates") return [dataRoot];
  const frameworkRoot = frameworkTemplatesRoot();
  return dataRoot === frameworkRoot ? [dataRoot] : [dataRoot, frameworkRoot];
}

function pathSection(filePath: string): SectionKey | "unknown" {
  const rel = displayPath(filePath);
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
    } else if (entry.isFile() && entry.name.endsWith(".md") && isReadableManagedPath(target)) {
      files.push(target);
    }
  }
  return files;
}

function allMarkdownFiles(): string[] {
  const { dataRoot } = config();
  const byDisplayPath = new Map<string, string>();
  const dashboard = path.join(dataRoot, "dashboard.md");
  if (fs.existsSync(dashboard)) byDisplayPath.set(displayPath(dashboard), dashboard);
  for (const folder of [...managedDirs].sort()) {
    const roots = folder === "templates" ? sectionRoots("templates") : [path.join(dataRoot, folder)];
    for (const root of roots) {
      for (const file of walkMarkdown(root)) {
        const display = displayPath(file);
        if (!byDisplayPath.has(display)) byDisplayPath.set(display, file);
      }
    }
  }
  return [...byDisplayPath.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([, file]) => file);
}

function formatDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function todayDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function diffSummary(before: string, after: string): { added: number; removed: number; changed: number; preview: string } {
  const beforeLines = before.replace(/\r\n/g, "\n").split("\n");
  const afterLines = after.replace(/\r\n/g, "\n").split("\n");
  let added = 0;
  let removed = 0;
  let changed = 0;
  const preview: string[] = [];
  const max = Math.max(beforeLines.length, afterLines.length);
  for (let index = 0; index < max; index += 1) {
    const left = beforeLines[index];
    const right = afterLines[index];
    if (left === right) {
      if (preview.length < 80 && left !== undefined) preview.push(` ${left}`);
      continue;
    }
    changed += 1;
    if (left !== undefined) {
      removed += 1;
      if (preview.length < 80) preview.push(`-${left}`);
    }
    if (right !== undefined) {
      added += 1;
      if (preview.length < 80) preview.push(`+${right}`);
    }
  }
  return { added, removed, changed, preview: preview.join("\n") };
}

function normalizeTagsValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
}

function touchFrontMatter(text: string, relPath: string): string {
  const withRecommended = ensureRecommendedFrontMatter(text, relPath);
  const parsed = parseMarkdownDocument(withRecommended);
  if (parsed.frontMatterError) return text;
  return replaceFrontMatter(withRecommended, { ...parsed.frontMatter, updated: todayDate() });
}

function weekId(date = new Date()): string {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function cleanCell(value: string | null | undefined): string {
  return parseCleanCell(value ?? "");
}

function meaningful(value: string | null | undefined): boolean {
  const clean = cleanCell(value);
  return Boolean(clean) && !["-", "—", "待填写", "无", "暂无"].includes(clean);
}

function isDoneStatus(value: string | null | undefined): boolean {
  return ["已完成", "完成", "done"].includes(cleanCell(value).toLocaleLowerCase());
}

function taskKey(value: string | null | undefined): string {
  return cleanCell(value).toLocaleLowerCase();
}

function isBlockedStatus(value: string | null | undefined): boolean {
  return ["受阻", "阻塞", "落后", "暂停"].some((item) => cleanCell(value).includes(item));
}

function filePathsForSection(section: SectionKey): string[] {
  return listMarkdownFiles(section, "", "updated").map((item) => resolveManaged(item.path));
}

function sectionBody(text: string, heading: string): { body: string; startLine: number } | null {
  return parseSectionBody(text, heading);
}

function tableRows(text: string, heading: string): Array<{ cells: string[]; line: number }> {
  return parseTableRows(text, heading).filter((row) => row.cells.some(meaningful));
}

function bulletItems(text: string, heading: string): Array<{ text: string; checked: boolean; line: number }> {
  return parseTaskItems(text, heading).filter((item) => meaningful(item.text));
}

function collectCompletedTaskKeys(): Set<string> {
  const completed = new Set<string>();
  const addTask = (title: string) => {
    if (meaningful(title)) completed.add(taskKey(title));
  };

  for (const filePath of filePathsForSection("logs")) {
    for (const row of tableRows(readText(filePath), "今日完成")) {
      const [title = "", result = "", , evidence = ""] = row.cells;
      if (isDoneStatus(result) || meaningful(evidence)) addTask(title);
    }
  }

  for (const filePath of filePathsForSection("reviews")) {
    const text = readText(filePath);
    for (const row of tableRows(text, "完成情况")) {
      const [title = "", result = "", diff = ""] = row.cells;
      if (isDoneStatus(result) || isDoneStatus(diff)) addTask(title);
    }
    for (const row of tableRows(text, "关键产出")) {
      const [, title = "", result = "", evidence = ""] = row.cells;
      if (isDoneStatus(result) || meaningful(evidence)) addTask(title);
    }
  }

  return completed;
}

function managedPathInText(text: string, section: string): string | undefined {
  const match = text.match(new RegExp(`${section}/[^\\s\`，。|)）]+\\.md`));
  return match?.[0];
}

function reviewPathForPlan(planPath: string, text: string): string {
  return managedPathInText(text, "reviews") ?? `reviews/${path.basename(planPath, ".md")}.md`;
}

function sourceDetail(line: number | undefined, fallback: string): string {
  return line ? `${fallback} · 第 ${line} 行` : fallback;
}

function parsePlanTasks(filePath: string, today: string, completedTasks = new Set<string>()): ExecutionTask[] {
  const meta = fileMeta(filePath);
  const text = readText(filePath);
  const tasks: ExecutionTask[] = [];
  for (const row of tableRows(text, "任务安排")) {
    const [dueDate = "", title = "", estimate = "", output = "", status = ""] = row.cells;
    if (!meaningful(title) || isDoneStatus(status) || completedTasks.has(taskKey(title))) continue;
    const priority = dueDate === today || isBlockedStatus(status) ? "high" : "medium";
    tasks.push({
      id: `${meta.path}:${row.line}:${title}`,
      title,
      status: meaningful(status) ? status : "未开始",
      priority,
      dueDate: meaningful(dueDate) ? dueDate : undefined,
      output: meaningful(output) ? output : meaningful(estimate) ? `预计用时：${estimate}` : undefined,
      source: meta,
      sourceDetail: sourceDetail(row.line, "任务安排")
    });
  }
  for (const item of bulletItems(text, "每日最低动作")) {
    if (item.checked || completedTasks.has(taskKey(item.text))) continue;
    tasks.push({
      id: `${meta.path}:${item.line}:${item.text}`,
      title: item.text,
      status: "未开始",
      priority: "medium",
      source: meta,
      sourceDetail: sourceDetail(item.line, "每日最低动作")
    });
  }
  return tasks;
}

function routeProgressFromFile(filePath: string): ExecutionRouteProgress | null {
  const meta = fileMeta(filePath);
  const rows = tableRows(readText(filePath), "阶段路线");
  if (!rows.length) return null;
  const stages = rows.map((row) => {
    const [stage = "", theme = "", keyTask = "", output = "", acceptance = "", status = ""] = row.cells;
    return { stage, theme, keyTask, output, acceptance, status: meaningful(status) ? status : "未开始" };
  }).filter((item) => meaningful(item.stage) || meaningful(item.theme) || meaningful(item.keyTask));
  const current = stages.find((item) => item.status.includes("进行中") || item.status.toLocaleLowerCase() === "active") ?? stages.find((item) => !isDoneStatus(item.status));
  if (!current) return null;
  const next = stages.find((item) => item !== current && !isDoneStatus(item.status));
  return {
    route: meta,
    currentStage: current.stage,
    currentTheme: current.theme,
    keyTask: current.keyTask,
    output: current.output,
    acceptance: current.acceptance,
    status: current.status,
    nextStage: next ? `${next.stage} ${next.theme}`.trim() : undefined
  };
}

function collectBlockers(): ExecutionBlocker[] {
  const byProblem = new Map<string, ExecutionBlocker>();
  const sources: Array<{ section: SectionKey; headings: string[]; problemIndex: number; nextIndex: number }> = [
    { section: "logs", headings: ["遇到的问题"], problemIndex: 0, nextIndex: 2 },
    { section: "plans", headings: ["重点问题", "风险与调整"], problemIndex: 0, nextIndex: 1 },
    { section: "reviews", headings: ["问题与教训"], problemIndex: 0, nextIndex: 2 }
  ];
  for (const source of sources) {
    for (const filePath of filePathsForSection(source.section)) {
      const meta = fileMeta(filePath);
      const text = readText(filePath);
      for (const heading of source.headings) {
        for (const row of tableRows(text, heading)) {
          const problem = row.cells[source.problemIndex] ?? "";
          if (!meaningful(problem)) continue;
          const key = problem.toLocaleLowerCase();
          const existing = byProblem.get(key);
          if (existing) {
            existing.count += 1;
            existing.latestSeen = meta.updated;
            existing.source = meta;
            existing.nextStep = row.cells[source.nextIndex] || existing.nextStep;
          } else {
            byProblem.set(key, {
              id: `${meta.path}:${row.line}:${problem}`,
              problem,
              count: 1,
              firstSeen: meta.updated,
              latestSeen: meta.updated,
              source: meta,
              nextStep: row.cells[source.nextIndex] ?? ""
            });
          }
        }
      }
    }
  }
  return [...byProblem.values()].sort((a, b) => b.count - a.count || b.latestSeen.localeCompare(a.latestSeen)).slice(0, 8);
}

function collectEvidence(): ExecutionEvidence[] {
  const evidence: ExecutionEvidence[] = [];
  for (const filePath of filePathsForSection("logs")) {
    const meta = fileMeta(filePath);
    for (const row of tableRows(readText(filePath), "今日完成")) {
      const title = row.cells[3] || row.cells[1] || row.cells[0] || "";
      if (!meaningful(title)) continue;
      evidence.push({
        id: `${meta.path}:${row.line}:${title}`,
        title,
        kind: "log",
        source: meta,
        detail: row.cells[0] ? `任务：${row.cells[0]}` : "日志产出"
      });
    }
  }
  for (const filePath of filePathsForSection("reviews")) {
    const meta = fileMeta(filePath);
    for (const row of tableRows(readText(filePath), "关键产出")) {
      const title = row.cells[3] || row.cells[2] || row.cells[1] || row.cells[0] || "";
      if (!meaningful(title)) continue;
      evidence.push({
        id: `${meta.path}:${row.line}:${title}`,
        title,
        kind: "review",
        source: meta,
        detail: row.cells[1] ? `复盘任务：${row.cells[1]}` : "复盘关键产出"
      });
    }
    for (const item of bulletItems(readText(filePath), "关键产出")) {
      evidence.push({
        id: `${meta.path}:${item.line}:${item.text}`,
        title: item.text,
        kind: "review",
        source: meta,
        detail: "复盘关键产出"
      });
    }
  }
  for (const section of ["projects", "resources"] as SectionKey[]) {
    for (const meta of listMarkdownFiles(section, "", "updated").slice(0, 3)) {
      evidence.push({
        id: `${meta.path}:file`,
        title: meta.title,
        kind: "file",
        source: meta,
        detail: section === "projects" ? "最近项目更新" : "最近资源更新"
      });
    }
  }
  return evidence.sort((a, b) => b.source.updated.localeCompare(a.source.updated)).slice(0, 8);
}

function collectPendingReviews(plans: FileMeta[]): ExecutionReviewItem[] {
  return plans.slice(0, 6).map((plan) => {
    const text = readText(resolveManaged(plan.path));
    const reviewPath = reviewPathForPlan(plan.path, text);
    let reviewFile = "";
    try {
      reviewFile = resolveManaged(reviewPath);
    } catch {
      reviewFile = "";
    }
    if (!reviewFile || !fs.existsSync(reviewFile)) {
      return {
        id: `${plan.path}:review`,
        plan,
        reviewPath,
      status: "missing" as const,
      reason: "计划已有复盘入口，但还没有对应复盘文件"
      };
    }
    const reviewText = readText(reviewFile);
    const ready = /##\s*(本期结论|完成情况|下周期调整)/.test(reviewText) && extractExcerpt(reviewText).length > 20;
    return {
      id: `${plan.path}:review`,
      plan,
      reviewPath,
      status: ready ? "ready" as const : "empty" as const,
      reason: ready ? "复盘文件已有内容" : "复盘文件已经建了，但还没写清楚这周做得怎么样"
    };
  }).filter((item) => item.status !== "ready");
}

function buildSuggestions(input: {
  routeProgress: ExecutionRouteProgress[];
  unfinishedTasks: ExecutionTask[];
  blockers: ExecutionBlocker[];
  pendingReviews: ExecutionReviewItem[];
  evidence: ExecutionEvidence[];
}): ExecutionAdjustmentSuggestion[] {
  const routePath = input.routeProgress[0]?.route.path;
  const suggestions: ExecutionAdjustmentSuggestion[] = [];
  const repeated = input.blockers.find((item) => item.count >= 2) ?? input.blockers[0];
  if (repeated) {
    suggestions.push({
      id: "blocker-adjustment",
      title: "先处理反复卡住的问题",
      reason: `“${repeated.problem}”已经出现 ${repeated.count} 次，最近一次在 ${repeated.source.path}`,
      action: `把“${repeated.problem}”写进路线调整记录，并给它安排一个很小的下一步。`,
      routePath
    });
  }
  if (input.unfinishedTasks.length) {
    suggestions.push({
      id: "unfinished-plan-adjustment",
      title: "本周先挑少一点做",
      reason: `现在还有 ${input.unfinishedTasks.length} 个计划项没完成，最靠前的是“${input.unfinishedTasks[0].title}”`,
      action: "把当前阶段先改成 1-2 个最重要的小任务，做完后留下链接、截图或提交记录。",
      routePath
    });
  }
  if (input.pendingReviews.length) {
    suggestions.push({
      id: "review-adjustment",
      title: "先写复盘，再改路线",
      reason: `${input.pendingReviews.length} 个计划还没写清楚结果，暂时看不出下一步该怎么改`,
      action: "先生成本周复盘，写清楚哪些做完了、哪里卡住了、下周准备怎么改。",
      routePath
    });
  }
  if (!input.evidence.length) {
    suggestions.push({
      id: "evidence-adjustment",
      title: "给当前阶段补一个看得见的成果",
      reason: "最近日志和复盘里没有链接、截图、提交记录这类成果",
      action: "给当前阶段加一个小成果要求，比如一篇笔记、一个 demo、一次 commit 或一张截图。",
      routePath
    });
  }
  return suggestions.slice(0, 5);
}

export function executionSummary(): ExecutionSummary {
  const today = todayDate();
  const week = weekId();
  const focus = dashboardFocus();
  const plans = listMarkdownFiles("plans", "", "updated");
  const activePlan = plans[0];
  const completedTasks = collectCompletedTaskKeys();
  const planTasks = filePathsForSection("plans").flatMap((filePath) => parsePlanTasks(filePath, today, completedTasks));
  const dashboardTask = focus["今日任务"];
  const todayTasks = [
    ...(meaningful(dashboardTask) && !completedTasks.has(taskKey(dashboardTask))
      ? [{
          id: "dashboard:today",
          title: dashboardTask,
          status: "待执行",
          priority: "high" as const,
          dueDate: today,
          source: fileMeta(path.join(config().dataRoot, "dashboard.md")),
          sourceDetail: "dashboard 当前焦点"
        }]
      : []),
    ...planTasks.filter((task) => task.dueDate === today || !task.dueDate).slice(0, 8)
  ].slice(0, 10);
  const routeProgress = filePathsForSection("routes").map(routeProgressFromFile).filter((item): item is ExecutionRouteProgress => Boolean(item)).slice(0, 4);
  const blockers = collectBlockers();
  const evidence = collectEvidence();
  const pendingReviews = collectPendingReviews(plans);
  const unfinishedTasks = planTasks.slice(0, 12);
  return {
    week,
    activePlan,
    todayTasks,
    unfinishedTasks,
    routeProgress,
    blockers,
    evidence,
    pendingReviews,
    suggestions: buildSuggestions({ routeProgress, unfinishedTasks, blockers, pendingReviews, evidence })
  };
}

export function extractTitle(text: string, fallback: string): string {
  return extractMarkdownTitle(text, fallback);
}

export function extractExcerpt(text: string): string {
  const body = parseMarkdownDocument(text).body;
  const lines: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const clean = line.trim();
    if (clean && !clean.startsWith("#") && !clean.startsWith("| ---")) {
      lines.push(clean.replace(/^\|+|\|+$/g, "").trim());
    }
    if (lines.join(" ").length > 100) break;
  }
  return lines.join(" ").slice(0, 140);
}

export function fileMeta(filePath: string): FileMeta {
  assertReadablePath(filePath);
  const stat = fs.statSync(filePath);
  let text = "";
  try {
    text = readText(filePath);
  } catch {
    text = "";
  }
  const document = parseMarkdownDocument(text);
  const frontMatter = document.frontMatter;
  return {
    id: typeof frontMatter.id === "string" ? frontMatter.id : undefined,
    path: displayPath(filePath),
    name: path.basename(filePath),
    title: extractTitle(text, path.basename(filePath, ".md")),
    section: pathSection(filePath),
    updated: formatDate(stat.mtime),
    size: stat.size,
    excerpt: extractExcerpt(text),
    tags: normalizeTagsValue(frontMatter.tags),
    status: typeof frontMatter.status === "string" ? frontMatter.status : undefined,
    favorite: frontMatter.favorite === true,
    pinned: frontMatter.pinned === true
  };
}

export function listMarkdownFiles(section: string, query = "", sort: SortMode = "updated"): FileMeta[] {
  let files: string[] = [];
  if (section === "dashboard") {
    const dashboard = path.join(config().dataRoot, "dashboard.md");
    files = fs.existsSync(dashboard) ? [dashboard] : [];
  } else {
    const byDisplayPath = new Map<string, string>();
    for (const root of sectionRoots(section)) {
      for (const file of walkMarkdown(root)) {
        const display = displayPath(file);
        if (!byDisplayPath.has(display)) byDisplayPath.set(display, file);
      }
    }
    files = [...byDisplayPath.values()];
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
  let filePath = resolveManaged(pathValue);
  if (!fs.existsSync(filePath) && pathParts(pathValue)[0] === "templates") {
    const fallback = joinSafe(config().frameworkRoot, safeRelativeParts(pathValue));
    if (isFrameworkTemplatePath(fallback) && fs.existsSync(fallback)) filePath = fallback;
  }
  return { meta: fileMeta(filePath), content: readText(filePath) };
}

export function backupFile(filePath: string): string {
  assertWritablePath(filePath);
  if (!fs.existsSync(filePath)) throw new Error("文件不存在");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const backup = joinSafe(config().dataRoot, [".backups", "study-gui", stamp, ...pathParts(relativePath(filePath))]);
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(filePath, backup);
  return backup;
}

export function saveFile(pathValue: string, content: string) {
  const filePath = resolveManaged(pathValue);
  const before = fs.existsSync(filePath) ? readText(filePath) : "";
  const backup = fs.existsSync(filePath) ? backupFile(filePath) : undefined;
  const rel = relativePath(filePath);
  const nextContent = touchFrontMatter(content, rel);
  writeText(filePath, nextContent);
  return {
    ok: true as const,
    meta: fileMeta(filePath),
    ...(backup ? { backup: relativePath(backup) } : {}),
    diff: diffSummary(before, nextContent)
  };
}

export function updateFileFrontMatter(pathValue: string, patch: Partial<Pick<DocumentFrontMatter, "tags" | "status" | "favorite" | "pinned">>) {
  const filePath = resolveManaged(pathValue);
  const backup = backupFile(filePath);
  const text = readText(filePath);
  const rel = relativePath(filePath);
  const withRecommended = ensureRecommendedFrontMatter(text, rel);
  const parsed = parseMarkdownDocument(withRecommended);
  if (parsed.frontMatterError) throw new Error(parsed.frontMatterError);
  const allowed: Partial<DocumentFrontMatter> = {};
  if (Array.isArray(patch.tags)) allowed.tags = normalizeTagsValue(patch.tags).slice(0, 12);
  if (typeof patch.status === "string") allowed.status = patch.status.trim() || undefined;
  if (typeof patch.favorite === "boolean") allowed.favorite = patch.favorite;
  if (typeof patch.pinned === "boolean") allowed.pinned = patch.pinned;
  const nextFrontMatter = Object.fromEntries(
    Object.entries({ ...parsed.frontMatter, ...allowed, updated: todayDate() }).filter(([, value]) => value !== undefined && value !== "")
  ) as DocumentFrontMatter;
  writeText(filePath, replaceFrontMatter(withRecommended, nextFrontMatter));
  return { ok: true as const, meta: fileMeta(filePath), backup: relativePath(backup) };
}

export function createFile(section: string, title: string, name: string) {
  if (section === "dashboard") throw new Error("总览不能创建子文件");
  const filename = slugifyFilename(name || title);
  const filePath = joinSafe(dataSectionRoot(section), [filename]);
  if (!isManagedPath(filePath)) throw new Error("文件路径无效");
  if (fs.existsSync(filePath)) throw new Error("文件已存在");
  const rel = relativePath(filePath);
  const content = defaultContent(section, title || path.basename(filePath, ".md"));
  writeText(filePath, ensureRecommendedFrontMatter(content, rel, title || path.basename(filePath, ".md")));
  return { ok: true as const, meta: fileMeta(filePath) };
}

export function renameFile(pathValue: string, newName: string) {
  const source = resolveManaged(pathValue);
  if (path.basename(source) === "dashboard.md") throw new Error("dashboard.md 不能重命名");
  const target = joinSafe(path.dirname(source), [slugifyFilename(newName)]);
  if (!isManagedPath(target)) throw new Error("目标路径无效");
  if (fs.existsSync(target)) throw new Error("目标文件已存在");
  fs.renameSync(source, target);
  return { ok: true as const, meta: fileMeta(target) };
}

export function archiveFile(pathValue: string) {
  const source = resolveManaged(pathValue);
  if (path.basename(source) === "dashboard.md") throw new Error("dashboard.md 不能归档");
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const target = joinSafe(config().dataRoot, [".trash", "study-gui", stamp, ...pathParts(relativePath(source))]);
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
    if (!`${displayPath(filePath)}\n${text}`.toLocaleLowerCase().includes(needle)) continue;
    let lineNo = 1;
    let snippet = extractExcerpt(text);
    const document = parseMarkdownDocument(text);
    const searchableBody = document.frontMatterError ? text : document.body;
    const bodyStartLine = document.rawFrontMatter ? document.rawFrontMatter.split(/\r?\n/).length + 1 : 1;
    searchableBody.split(/\r?\n/).some((line, index) => {
      if (line.toLocaleLowerCase().includes(needle)) {
        lineNo = bodyStartLine + index;
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
    workspace_schema_version: currentWorkspaceSchemaVersion(),
    sections: sectionSummaries,
    stats: {
      files: totalFiles,
      sections: sectionSummaries.length,
      logs: listMarkdownFiles("logs").length,
      plans: listMarkdownFiles("plans").length
    },
    focus: dashboardFocus(),
    recent,
    execution: executionSummary()
  };
}

export function replaceFocusLine(text: string, label: string, value: string): string {
  const target = `- ${label}：`;
  const clean = value.trim();
  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    if (lines[index].startsWith(target)) {
      lines[index] = `${target}${clean}`;
      return `${lines.join("\n").replace(/\n*$/, "")}\n`;
    }
  }
  if (!clean) return text;
  const marker = "## 当前焦点";
  const markerIndex = lines.findIndex((line) => line.trim() === marker);
  if (markerIndex >= 0) {
    lines.splice(markerIndex + 1, 0, "", `${target}${clean}`);
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
  if (!fs.existsSync(filePath)) writeText(filePath, ensureRecommendedFrontMatter(defaultContent("logs", date), relativePath(filePath), date));
  return filePath;
}

export function appendDailyLog(payload: Record<string, string>) {
  const date = normalizeDate(payload.date);
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

function requireSectionPath(pathValue: string, section: SectionKey): string {
  const filePath = resolveManaged(pathValue);
  const meta = fileMeta(filePath);
  if (meta.section !== section) throw new Error(`请选择${sectionByKey.get(section)?.label ?? section}文件`);
  return filePath;
}

function normalizeWeek(value?: string): string {
  if (!value) return weekId();
  const clean = value.trim();
  if (!/^\d{4}-W\d{2}$/.test(clean)) throw new Error("周计划编号格式应为 YYYY-Www");
  return clean;
}

function normalizeDate(value?: string): string {
  if (!value) return todayDate();
  const clean = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) throw new Error("日期格式应为 YYYY-MM-DD");
  return clean;
}

function ensureHeading(text: string, heading: string, body = ""): string {
  if (text.includes(`## ${heading}`)) return text;
  return `${text.replace(/\n*$/, "")}\n\n## ${heading}\n\n${body}`.replace(/\n*$/, "\n");
}

export function createPlanFromRoute(payload: Record<string, string>) {
  const routePath = payload.routePath || payload.path;
  const routeFile = requireSectionPath(routePath, "routes");
  const week = normalizeWeek(payload.week);
  const target = path.join(config().dataRoot, "plans", `${week}.md`);
  if (fs.existsSync(target)) {
    return { ok: true as const, path: relativePath(target), existed: true, meta: fileMeta(target) };
  }
  const routeMeta = fileMeta(routeFile);
  const routeProgress = routeProgressFromFile(routeFile);
  const task = routeProgress?.keyTask || routeProgress?.currentTheme || "推进当前路线阶段";
  const output = routeProgress?.output || "能看到的学习成果";
  const text = `# 学习计划：${week}

## 基本信息

- 计划周期：${week}
- 关联目标：
- 关联路线：\`${routeMeta.path}\`
- 本周期主题：${routeProgress?.currentTheme || routeMeta.title}
- 计划总时长：

## 本周期目标

| 目标 | 验收方式 | 优先级 |
| --- | --- | --- |
| ${task} | ${routeProgress?.acceptance || output} | 高 |

## 任务安排

| 日期 | 任务 | 预计用时 | 产出物 | 状态 |
| --- | --- | ---: | --- | --- |
|  | ${task} |  | ${output} | 未开始 |

## 每日最低动作

- 记录当天完成内容、问题和下一步。

## 重点问题

| 问题 | 解决路径 | 截止时间 |
| --- | --- | --- |

## 复盘入口

- 对应复盘文件：\`reviews/${week}.md\`
`;
  writeText(target, ensureRecommendedFrontMatter(text, relativePath(target), week));
  return { ok: true as const, path: relativePath(target), existed: false, meta: fileMeta(target) };
}

export function createLogFromPlan(payload: Record<string, string>) {
  const planPath = payload.planPath || payload.path;
  const planFile = requireSectionPath(planPath, "plans");
  const date = normalizeDate(payload.date);
  const target = path.join(config().dataRoot, "logs", `${date}.md`);
  const existed = fs.existsSync(target);
  const backup = existed ? backupFile(target) : undefined;
  let text = existed ? readText(target) : defaultContent("logs", date);
  text = text.replace(/- 日期：.*(\r?\n|$)/, `- 日期：${date}\n`);
  text = text.replace(/- 关联计划：.*(\r?\n|$)/, `- 关联计划：\`${relativePath(planFile)}\`\n`);
  text = ensureHeading(text, "今日完成", "| 任务 | 结果 | 用时 | 证据或产出 |\n| --- | --- | ---: | --- |\n");
  text = ensureHeading(text, "关键收获");
  text = ensureHeading(text, "遇到的问题", "| 问题 | 当前判断 | 下一步 |\n| --- | --- | --- |\n");
  text = ensureHeading(text, "明日计划");
  text = ensureHeading(text, "备注");
  writeText(target, ensureRecommendedFrontMatter(text, relativePath(target), date));
  return {
    ok: true as const,
    path: relativePath(target),
    existed,
    ...(backup ? { backup: relativePath(backup) } : {}),
    meta: fileMeta(target)
  };
}

export function createReviewFromPlan(payload: Record<string, string>) {
  const planPath = payload.planPath || payload.path;
  const planFile = requireSectionPath(planPath, "plans");
  const planBase = path.basename(planFile, ".md");
  const week = normalizeWeek(payload.week || (/^\d{4}-W\d{2}$/.test(planBase) ? planBase : undefined));
  const target = path.join(config().dataRoot, "reviews", `${week}.md`);
  if (fs.existsSync(target)) {
    return { ok: true as const, path: relativePath(target), existed: true, meta: fileMeta(target) };
  }
  const planMeta = fileMeta(planFile);
  const taskRows = tableRows(readText(planFile), "任务安排");
  const completionRows = filePathsForSection("logs").flatMap((filePath) =>
    tableRows(readText(filePath), "今日完成").map((row) => ({ row, meta: fileMeta(filePath) }))
  );
  const completionText = completionRows.slice(0, 8).map(({ row, meta }) => markdownRow([meta.path, row.cells[0] ?? "", row.cells[1] ?? "", row.cells[3] ?? ""])).join("\n");
  const planText = taskRows.slice(0, 8).map((row) => markdownRow([row.cells[1] ?? "", row.cells[4] ?? "未开始", "", ""])).join("\n");
  const text = `# 学习复盘：${week}

## 基本信息

- 复盘周期：${week}
- 关联目标：
- 关联计划：\`${planMeta.path}\`
- 总学习时长：
- 总体状态：

## 完成情况

| 原计划 | 实际结果 | 差异 | 原因 |
| --- | --- | --- | --- |
${planText}

## 有效做法

- 

## 问题与教训

| 问题 | 根因 | 后续调整 |
| --- | --- | --- |

## 关键产出

| 来源 | 任务 | 结果 | 证据或产出 |
| --- | --- | --- | --- |
${completionText || "|  |  |  |  |"}

## 下周期调整

| 调整项 | 操作 | 预期效果 |
| --- | --- | --- |
`;
  writeText(target, ensureRecommendedFrontMatter(text, relativePath(target), week));
  return { ok: true as const, path: relativePath(target), existed: false, meta: fileMeta(target) };
}

function appendRouteAdjustment(text: string, date: string, suggestion: string, reason: string): string {
  const row = markdownRow([date, suggestion, reason]);
  if (!text.includes("## 路线调整记录")) {
    return `${text.replace(/\n*$/, "")}\n\n## 路线调整记录\n\n| 日期 | 调整内容 | 原因 |\n| --- | --- | --- |\n${row}\n`;
  }
  if (!sectionBody(text, "路线调整记录")?.body.includes("| ---")) {
    return appendBullet(text, "路线调整记录", `${date}：${suggestion}（${reason}）`);
  }
  return appendAfterTable(text, "路线调整记录", row);
}

export function applyRouteAdjustment(payload: Record<string, string>) {
  const routePath = payload.routePath || payload.path;
  const routeFile = requireSectionPath(routePath, "routes");
  const suggestion = payload.suggestion?.trim();
  if (!suggestion) throw new Error("缺少路线调整建议");
  const reason = payload.reason?.trim() || "Dashboard 建议";
  const backup = backupFile(routeFile);
  const text = appendRouteAdjustment(readText(routeFile), normalizeDate(payload.date), suggestion, reason);
  writeText(routeFile, text);
  return { ok: true as const, path: relativePath(routeFile), backup: relativePath(backup), meta: fileMeta(routeFile) };
}
