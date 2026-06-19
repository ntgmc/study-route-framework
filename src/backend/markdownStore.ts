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
  FileMeta,
  RepoSummary,
  SectionKey,
  SortMode
} from "../../types/domain.js";
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

export function resolveManaged(value: string): string {
  if (!value) throw new Error("缺少文件路径");
  const target = path.resolve(config().dataRoot, value);
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

function weekId(date = new Date()): string {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function cleanCell(value: string): string {
  return value.trim().replace(/^`|`$/g, "").trim();
}

function meaningful(value: string): boolean {
  const clean = cleanCell(value);
  return Boolean(clean) && !["-", "—", "待填写", "无", "暂无"].includes(clean);
}

function isDoneStatus(value: string): boolean {
  return ["已完成", "完成", "done"].includes(cleanCell(value).toLocaleLowerCase());
}

function isBlockedStatus(value: string): boolean {
  return ["受阻", "阻塞", "落后", "暂停"].some((item) => cleanCell(value).includes(item));
}

function filePathsForSection(section: SectionKey): string[] {
  return listMarkdownFiles(section, "", "updated").map((item) => resolveManaged(item.path));
}

function sectionBody(text: string, heading: string): { body: string; startLine: number } | null {
  const lines = text.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === `## ${heading}`);
  if (headingIndex < 0) return null;
  const endIndex = lines.findIndex((line, index) => index > headingIndex && /^##\s+/.test(line.trim()));
  return {
    body: lines.slice(headingIndex + 1, endIndex < 0 ? lines.length : endIndex).join("\n"),
    startLine: headingIndex + 2
  };
}

function splitTableRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map(cleanCell);
}

function tableRows(text: string, heading: string): Array<{ cells: string[]; line: number }> {
  const section = sectionBody(text, heading);
  if (!section) return [];
  const lines = section.body.split(/\r?\n/);
  const rows: Array<{ cells: string[]; line: number }> = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line.startsWith("|") || /^\|\s*-+/.test(line)) continue;
    const next = lines[index + 1]?.trim() ?? "";
    if (/^\|\s*:?-+/.test(next)) continue;
    const cells = splitTableRow(line);
    if (cells.some(meaningful)) rows.push({ cells, line: section.startLine + index });
  }
  return rows;
}

function bulletItems(text: string, heading: string): Array<{ text: string; checked: boolean; line: number }> {
  const section = sectionBody(text, heading);
  if (!section) return [];
  return section.body
    .split(/\r?\n/)
    .map((line, index) => {
      const match = line.match(/^\s*-\s*(\[[ xX]\]\s*)?(.*)$/);
      if (!match) return null;
      const textValue = cleanCell(match[2] ?? "");
      if (!meaningful(textValue)) return null;
      return { text: textValue, checked: /\[[xX]\]/.test(match[1] ?? ""), line: section.startLine + index };
    })
    .filter((item): item is { text: string; checked: boolean; line: number } => Boolean(item));
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

function parsePlanTasks(filePath: string, today: string): ExecutionTask[] {
  const meta = fileMeta(filePath);
  const text = readText(filePath);
  const tasks: ExecutionTask[] = [];
  for (const row of tableRows(text, "任务安排")) {
    const [dueDate = "", title = "", estimate = "", output = "", status = ""] = row.cells;
    if (!meaningful(title) || isDoneStatus(status)) continue;
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
    if (item.checked) continue;
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
    const reviewFile = path.resolve(config().dataRoot, reviewPath);
    if (!fs.existsSync(reviewFile)) {
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
      reason: ready ? "复盘文件已有内容" : "复盘文件存在，但内容还不足以形成反馈"
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
      title: "把反复阻塞拆成下一阶段任务",
      reason: `“${repeated.problem}”出现 ${repeated.count} 次，最近来源是 ${repeated.source.path}`,
      action: `在路线调整记录中新增针对“${repeated.problem}”的拆解动作，并把下一步限定为一个可验证产出。`,
      routePath
    });
  }
  if (input.unfinishedTasks.length) {
    suggestions.push({
      id: "unfinished-plan-adjustment",
      title: "收敛本周未完成任务",
      reason: `当前还有 ${input.unfinishedTasks.length} 个未完成计划项，最靠前的是“${input.unfinishedTasks[0].title}”`,
      action: "把路线当前阶段的任务范围压缩到 1-2 个高优先级动作，先交付可记录证据的产出。",
      routePath
    });
  }
  if (input.pendingReviews.length) {
    suggestions.push({
      id: "review-adjustment",
      title: "先补复盘再扩展路线",
      reason: `${input.pendingReviews.length} 个计划缺少有效复盘，无法判断路线是否应该继续推进`,
      action: "生成本周复盘，确认完成差异、问题根因和下周期调整后再改路线。",
      routePath
    });
  }
  if (!input.evidence.length) {
    suggestions.push({
      id: "evidence-adjustment",
      title: "为当前阶段定义最小产出证据",
      reason: "最近日志和复盘中没有可追踪产出，执行反馈不足",
      action: "给路线当前阶段补一个可提交、可截图或可链接的最小产出物。",
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
  const planTasks = filePathsForSection("plans").flatMap((filePath) => parsePlanTasks(filePath, today));
  const dashboardTask = focus["今日任务"];
  const todayTasks = [
    ...(meaningful(dashboardTask)
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
    path: displayPath(filePath),
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
    const fallback = path.resolve(config().frameworkRoot, pathValue);
    if (isFrameworkTemplatePath(fallback) && fs.existsSync(fallback)) filePath = fallback;
  }
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
  const filePath = path.resolve(dataSectionRoot(section), filename);
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
    if (!`${displayPath(filePath)}\n${text}`.toLocaleLowerCase().includes(needle)) continue;
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
    recent,
    execution: executionSummary()
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
  const output = routeProgress?.output || "可验证学习产出";
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
  writeText(target, text);
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
  writeText(target, text);
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

${completionText || "- "}

## 下周期调整

| 调整项 | 操作 | 预期效果 |
| --- | --- | --- |
`;
  writeText(target, text);
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
  const reason = payload.reason?.trim() || "Dashboard 执行闭环建议";
  const backup = backupFile(routeFile);
  const text = appendRouteAdjustment(readText(routeFile), normalizeDate(payload.date), suggestion, reason);
  writeText(routeFile, text);
  return { ok: true as const, path: relativePath(routeFile), backup: relativePath(backup), meta: fileMeta(routeFile) };
}
