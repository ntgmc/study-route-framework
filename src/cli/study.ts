#!/usr/bin/env node
import path from "node:path";
import { resolveDataConfig } from "../backend/config.js";
import { ensureRecommendedFrontMatter } from "../backend/documentModel.js";
import { defaultContent } from "../backend/templates.js";
import {
  appendAfterTable,
  appendBullet,
  markdownRow,
  readText,
  relativePath,
  writeText
} from "../backend/markdownStore.js";
import { doctorReport, healthReport, migrateWorkspace } from "../backend/workspace.js";
import type { CliCommand, ParsedCli } from "../../types/cli.js";

const DEFAULT_GOAL = "goals/2026-internship-ai-backend.md";
const DEFAULT_PLAN = "plans/2026-W25-project-kickoff.md";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function parseArgs(argv: string[]): ParsedCli {
  const command = argv[0] as CliCommand | undefined;
  if (!command) usage("缺少命令");
  const options: ParsedCli["options"] = {};
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) usage(`无法识别参数：${token}`);
    const key = token.slice(2);
    if (["force", "json", "dry-run"].includes(key)) {
      options[key] = true;
      continue;
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) usage(`参数 ${token} 缺少值`);
    index += 1;
    if (["done", "takeaway", "problem", "next", "note", "progress"].includes(key)) {
      const current = options[key];
      options[key] = Array.isArray(current) ? [...current, value] : [value];
    } else {
      options[key] = value;
    }
  }
  return { command, options };
}

function usage(message?: string): never {
  if (message) console.error(message);
  console.error("用法：npm run cli -- <init-log|add-log|leetcode|exam-review|dashboard|week-plan|health|doctor|migrate> [options]");
  process.exit(1);
}

function opt(options: ParsedCli["options"], key: string, fallback = ""): string {
  const value = options[key];
  return typeof value === "string" ? value : fallback;
}

function list(options: ParsedCli["options"], key: string): string[] {
  const value = options[key];
  return Array.isArray(value) ? value : [];
}

function requireOpt(options: ParsedCli["options"], key: string): string {
  const value = opt(options, key);
  if (!value) usage(`缺少必填参数 --${key}`);
  return value;
}

function parseRow(value: string, fields: number, label: string): string[] {
  const parts = value.split("|").map((part) => part.trim());
  if (parts.length !== fields) usage(`${label} 需要 ${fields} 个字段，用 | 分隔：${value}`);
  return parts;
}

function logPath(date: string): string {
  return path.join(resolveDataConfig().dataRoot, "logs", `${date}.md`);
}

function renderLog(date: string, status: string, hours: string, goal: string, plan: string): string {
  return `# 学习记录

## 基本信息

- 日期：${date}
- 关联目标：\`${goal}\`
- 关联计划：\`${plan}\`
- 实际学习时长：${hours}
- 今日状态：${status}

## 今日完成

| 任务 | 结果 | 用时 | 证据或产出 |
| --- | --- | ---: | --- |

## 关键收获

## 遇到的问题

| 问题 | 当前判断 | 下一步 |
| --- | --- | --- |

## 明日计划

## 备注
`;
}

function ensureLog(date: string, status: string, hours: string, goal: string, plan: string): string {
  const filePath = logPath(date);
  if (!readable(filePath)) writeText(filePath, ensureRecommendedFrontMatter(renderLog(date, status, hours, goal, plan), relativePath(filePath), date));
  return filePath;
}

function readable(filePath: string): boolean {
  try {
    readText(filePath);
    return true;
  } catch {
    return false;
  }
}

function printRelative(filePath: string): void {
  console.log(relativePath(filePath));
}

function printReport(report: unknown, options: ParsedCli["options"], fallback: string): void {
  if (options.json === true) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  console.log(fallback);
}

function cmdInitLog(options: ParsedCli["options"]): void {
  const date = opt(options, "date", today());
  const filePath = ensureLog(
    date,
    opt(options, "status", "顺利"),
    opt(options, "hours"),
    opt(options, "goal", DEFAULT_GOAL),
    opt(options, "plan", DEFAULT_PLAN)
  );
  printRelative(filePath);
}

function cmdAddLog(options: ParsedCli["options"]): void {
  const date = opt(options, "date", today());
  const filePath = ensureLog(
    date,
    opt(options, "status", "顺利"),
    opt(options, "hours"),
    opt(options, "goal", DEFAULT_GOAL),
    opt(options, "plan", DEFAULT_PLAN)
  );
  let text = readText(filePath);
  for (const item of list(options, "done")) {
    text = appendAfterTable(text, "今日完成", markdownRow(parseRow(item, 4, "--done")));
  }
  for (const item of list(options, "problem")) {
    text = appendAfterTable(text, "遇到的问题", markdownRow(parseRow(item, 3, "--problem")));
  }
  for (const item of list(options, "takeaway")) text = appendBullet(text, "关键收获", item);
  for (const item of list(options, "next")) text = appendBullet(text, "明日计划", item);
  for (const item of list(options, "note")) text = appendBullet(text, "备注", item);
  writeText(filePath, text);
  printRelative(filePath);
}

function ensureLeetcodeRecord(): string {
  const filePath = path.join(resolveDataConfig().dataRoot, "records", "leetcode.md");
  if (!readable(filePath)) {
    writeText(
      filePath,
      `# LeetCode 刷题记录

| 日期 | 专题 | 题目 | 难度 | 结果 | 是否重做 | 备注 |
| --- | --- | --- | --- | --- | --- | --- |
`
    );
  }
  return filePath;
}

function cmdLeetcode(options: ParsedCli["options"]): void {
  const filePath = ensureLeetcodeRecord();
  const row = markdownRow([
    opt(options, "date", today()),
    requireOpt(options, "topic"),
    requireOpt(options, "title"),
    opt(options, "difficulty", "中等"),
    opt(options, "result", "待复盘"),
    opt(options, "redo", "否"),
    opt(options, "note")
  ]);
  writeText(filePath, `${readText(filePath).trimEnd()}\n${row}\n`);
  printRelative(filePath);
}

function ensureExamReviewRecord(): string {
  const filePath = path.join(resolveDataConfig().dataRoot, "records", "exam-review.md");
  if (!readable(filePath)) {
    writeText(
      filePath,
      `# 期末复习记录

| 日期 | 科目 | 计划时长 | 实际时长 | 完成内容 | 问题 | 下一步 |
| --- | --- | ---: | ---: | --- | --- | --- |
`
    );
  }
  return filePath;
}

function cmdExamReview(options: ParsedCli["options"]): void {
  const filePath = ensureExamReviewRecord();
  const row = markdownRow([
    opt(options, "date", today()),
    requireOpt(options, "subject"),
    opt(options, "planned"),
    requireOpt(options, "actual"),
    opt(options, "done"),
    opt(options, "problem"),
    opt(options, "next")
  ]);
  writeText(filePath, `${readText(filePath).trimEnd()}\n${row}\n`);
  printRelative(filePath);
}

function replaceFocusLine(text: string, prefix: string, value: string): string {
  if (!value) return text;
  const target = `- ${prefix}：`;
  const lines = text.split(/\r?\n/);
  const index = lines.findIndex((line) => line.startsWith(target));
  if (index === -1) usage(`dashboard.md 中找不到行：${target}`);
  lines[index] = `${target}${value}`;
  return `${lines.join("\n").replace(/\n*$/, "")}\n`;
}

function updateProgressRow(text: string, spec: string, date: string): string {
  const [project, status, stage, milestone] = parseRow(spec, 4, "--progress");
  const lines = text.split(/\r?\n/);
  const existing = lines.findIndex((line) => line.startsWith(`| ${project} |`));
  if (existing >= 0) {
    lines[existing] = markdownRow([project, status, stage, milestone, date]);
    return `${lines.join("\n").replace(/\n*$/, "")}\n`;
  }
  const marker = "| --- | --- | --- | --- | --- |";
  const index = lines.findIndex((line) => line === marker);
  if (index === -1) usage("dashboard.md 中找不到进度概览表");
  lines.splice(index + 1, 0, markdownRow([project, status, stage, milestone, date]));
  return `${lines.join("\n").replace(/\n*$/, "")}\n`;
}

function cmdDashboard(options: ParsedCli["options"]): void {
  const filePath = path.join(resolveDataConfig().dataRoot, "dashboard.md");
  let text = readText(filePath);
  const date = opt(options, "date", today());
  text = replaceFocusLine(text, "当前阶段", opt(options, "stage"));
  text = replaceFocusLine(text, "本周重点", opt(options, "week"));
  text = replaceFocusLine(text, "今日任务", opt(options, "today"));
  for (const item of list(options, "progress")) text = updateProgressRow(text, item, date);
  writeText(filePath, text);
  printRelative(filePath);
}

function cmdWeekPlan(options: ParsedCli["options"]): void {
  const now = new Date();
  const week = opt(options, "week", `${now.getFullYear()}-W${String(weekNumber(now)).padStart(2, "0")}`);
  const filePath = path.join(resolveDataConfig().dataRoot, "plans", `${week}.md`);
  if (readable(filePath) && options.force !== true) {
    usage(`${relativePath(filePath)} 已存在；如需覆盖请加 --force`);
  }
  const text = `# 学习计划：${week}

## 基本信息

- 计划周期：${week}
- 关联目标：\`${opt(options, "goal", DEFAULT_GOAL)}\`
- 关联路线：\`${opt(options, "route", "routes/backend-plus-ai-application-roadmap.md")}\`
- 本周主题：${opt(options, "theme", "待填写")}
- 计划总时长：${opt(options, "hours", "待填写")}

## 本周期目标

| 目标 | 验收方式 | 优先级 |
| --- | --- | --- |

## 任务安排

| 日期 | 任务 | 预计用时 | 产出物 | 状态 |
| --- | --- | ---: | --- | --- |

## 每日最低动作

- 刷 1 道算法题，并记录解法要点。
- 学习 30 分钟后端、计算机基础或 Linux 实操。
- 在 \`logs/\` 中记录当天完成内容、问题和下一步。

## 重点问题

| 问题 | 解决路径 | 截止时间 |
| --- | --- | --- |

## 复盘入口

- 对应复盘文件：\`reviews/${week}.md\`
`;
  writeText(filePath, ensureRecommendedFrontMatter(text || defaultContent("plans", week), relativePath(filePath), week));
  printRelative(filePath);
}

function cmdHealth(options: ParsedCli["options"]): void {
  const report = healthReport();
  printReport(report, options, `health ok=${report.ok} schema=${report.schema_version} issues=${report.issues.length}`);
}

function cmdDoctor(options: ParsedCli["options"]): void {
  const report = doctorReport();
  printReport(report, options, `doctor ok=${report.ok} schema=${report.schema_version} checks=${report.checks.length} issues=${report.health.issues.length}`);
}

function cmdMigrate(options: ParsedCli["options"]): void {
  const report = migrateWorkspace({ dryRun: options["dry-run"] === true });
  printReport(report, options, `migrate ok=${report.ok} dry_run=${report.dry_run} actions=${report.actions.length} backups=${report.backups.length}`);
}

function weekNumber(date: Date): number {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

const parsed = parseArgs(process.argv.slice(2));

switch (parsed.command) {
  case "init-log":
    cmdInitLog(parsed.options);
    break;
  case "add-log":
    cmdAddLog(parsed.options);
    break;
  case "leetcode":
    cmdLeetcode(parsed.options);
    break;
  case "exam-review":
    cmdExamReview(parsed.options);
    break;
  case "dashboard":
    cmdDashboard(parsed.options);
    break;
  case "week-plan":
    cmdWeekPlan(parsed.options);
    break;
  case "health":
    cmdHealth(parsed.options);
    break;
  case "doctor":
    cmdDoctor(parsed.options);
    break;
  case "migrate":
    cmdMigrate(parsed.options);
    break;
  default:
    usage(`未知命令：${parsed.command}`);
}
