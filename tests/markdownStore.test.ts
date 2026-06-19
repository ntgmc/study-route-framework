import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveDataConfig } from "../src/backend/config.js";
import {
  appendDailyLog,
  applyRouteAdjustment,
  archiveFile,
  createFile,
  createLogFromPlan,
  createPlanFromRoute,
  createReviewFromPlan,
  executionSummary,
  getFile,
  isManagedPath,
  listMarkdownFiles,
  renameFile,
  saveFile,
  searchFiles,
  slugifyFilename,
  updateFileFrontMatter,
  updateDashboardFocus
} from "../src/backend/markdownStore.js";

let tempRoot = "";

function write(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "study-route-"));
  process.env.STUDY_ROUTE_DATA_DIR = tempRoot;
  write(
    path.join(tempRoot, "dashboard.md"),
    `# Dashboard

## 当前焦点

- 主目标：旧目标
- 当前阶段：旧阶段
- 本周重点：旧重点
- 今日任务：旧任务

| 项目 | 状态 | 当前阶段 | 下一里程碑 | 更新时间 |
| --- | --- | --- | --- | --- |
`
  );
  write(
    path.join(tempRoot, "routes", "demo.md"),
    `# Demo Route

## 阶段路线

| 阶段 | 主题 | 关键任务 | 产出物 | 验收标准 | 状态 |
| --- | --- | --- | --- | --- | --- |
| 1 | Dashboard 闭环 | 打通执行闭环 | demo 链接 | 能从 Dashboard 进入下一步 | 进行中 |
| 2 | 复盘优化 | 根据复盘调整路线 | 调整记录 | 有路线调整记录 | 未开始 |

## 路线调整记录

| 日期 | 调整内容 | 原因 |
| --- | --- | --- |
`
  );
  write(
    path.join(tempRoot, "plans", "demo.md"),
    `# Demo Plan

Body keyword

## 基本信息

- 关联路线：\`routes/demo.md\`

## 任务安排

| 日期 | 任务 | 预计用时 | 产出物 | 状态 |
| --- | --- | ---: | --- | --- |
|  | Build dashboard | 2h | demo link | 未开始 |
| 2026-06-10 | Old task | 1h |  | 进行中 |

## 每日最低动作

- [ ] Daily note

## 重点问题

| 问题 | 解决路径 | 截止时间 |
| --- | --- | --- |
| Parser blocked | Add tests | 2026-06-20 |

## 复盘入口

- 对应复盘文件：\`reviews/demo.md\`
`
  );
  write(
    path.join(tempRoot, "logs", "2026-06-17.md"),
    `# 学习记录

## 今日完成

| 任务 | 结果 | 用时 | 证据或产出 |
| --- | --- | ---: | --- |
| Build dashboard | Done | 1h | demo link |

## 关键收获

## 遇到的问题

| 问题 | 当前判断 | 下一步 |
| --- | --- | --- |
| Parser blocked | 表格解析不稳定 | Add tests |

## 明日计划
`
  );
});

afterEach(() => {
  delete process.env.STUDY_ROUTE_DATA_DIR;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("config", () => {
  it("resolves external data root from env", () => {
    expect(resolveDataConfig()).toMatchObject({ dataRoot: tempRoot, dataMode: "external" });
  });
});

describe("markdown store", () => {
  it("slugifies filenames", () => {
    expect(slugifyFilename("My Plan")).toBe("My-Plan.md");
    expect(slugifyFilename("bad<>name.md")).toBe("badname.md");
    expect(() => slugifyFilename("")).toThrow("文件名不能为空");
  });

  it("enforces managed paths", () => {
    expect(isManagedPath(path.join(tempRoot, "plans", "demo.md"))).toBe(true);
    expect(isManagedPath(path.join(tempRoot, ".backups", "demo.md"))).toBe(false);
    expect(isManagedPath(path.join(tempRoot, "plans", "demo.txt"))).toBe(false);
    expect(isManagedPath(path.join(tempRoot, "..", "outside.md"))).toBe(false);
  });

  it("lists, reads, saves, creates, renames, archives, and searches files", () => {
    expect(listMarkdownFiles("plans")).toHaveLength(1);
    expect(getFile("plans/demo.md").content).toContain("keyword");

    const saved = saveFile("plans/demo.md", "# Demo Plan\n\nUpdated keyword");
    expect(saved.backup).toContain(".backups/study-gui");
    expect(saved.diff.changed).toBeGreaterThan(0);
    expect(getFile("plans/demo.md").content).toContain("Updated");
    const meta = getFile("plans/demo.md").meta;
    expect(meta).toMatchObject({
      path: "plans/demo.md",
      id: "plan:demo",
      tags: [],
      favorite: false,
      pinned: false
    });

    const created = createFile("plans", "New Plan", "");
    expect(created.meta.path).toBe("plans/New-Plan.md");
    const createdId = created.meta.id;

    const renamed = renameFile(created.meta.path, "renamed.md");
    expect(renamed.meta.path).toBe("plans/renamed.md");
    expect(renamed.meta.id).toBe(createdId);

    const updatedMeta = updateFileFrontMatter("plans/demo.md", {
      tags: ["ts", "api"],
      favorite: true,
      pinned: true,
      status: "active"
    });
    expect(updatedMeta.backup).toContain(".backups/study-gui");
    expect(updatedMeta.meta).toMatchObject({ tags: ["ts", "api"], favorite: true, pinned: true, status: "active" });
    const updatedText = fs.readFileSync(path.join(tempRoot, "plans", "demo.md"), "utf8");
    expect(updatedText).toContain("tags: [ts, api]");
    expect(updatedText).toContain("favorite: true");
    expect(updatedText).toContain("Updated keyword");

    expect(searchFiles("Updated")[0].path).toBe("plans/demo.md");

    const archived = archiveFile("plans/renamed.md");
    expect(archived.archived_to).toContain(".trash/study-gui");
  });

  it("falls back to framework templates when external data has none", () => {
    const templates = listMarkdownFiles("templates", "", "name");
    expect(templates.map((item) => item.path)).toContain("templates/goal.md");
    expect(getFile("templates/goal.md").content).toContain("# 目标名称");

    saveFile("templates/goal.md", "# Custom Goal\n");
    expect(fs.readFileSync(path.join(tempRoot, "templates", "goal.md"), "utf8")).toContain("type: template");
    expect(fs.readFileSync(path.join(tempRoot, "templates", "goal.md"), "utf8")).toContain("# Custom Goal");
    expect(getFile("templates/goal.md").content).toContain("Custom Goal");

    const afterOverride = listMarkdownFiles("templates", "", "name").filter((item) => item.path === "templates/goal.md");
    expect(afterOverride).toHaveLength(1);
  });

  it("updates dashboard focus and appends daily log", () => {
    const focus = updateDashboardFocus({ main_goal: "新目标", today: "新任务" });
    expect(focus.focus["主目标"]).toBe("新目标");
    expect(focus.focus["今日任务"]).toBe("新任务");
    expect(focus.focus["当前阶段"]).toBe("旧阶段");

    const log = appendDailyLog({
      date: "2026-06-17",
      task: "Task",
      result: "Done",
      hours: "1h",
      evidence: "plans/demo.md",
      takeaway: "Keep notes",
      next: "Review"
    });
    expect(log.path).toBe("logs/2026-06-17.md");
    const content = fs.readFileSync(path.join(tempRoot, "logs", "2026-06-17.md"), "utf8");
    expect(content).toContain("| Task | Done | 1h | plans/demo.md |");
    expect(content).toContain("- Keep notes");
    expect(content).toContain("- Review");
  });

  it("builds an execution summary from routes, plans, logs, and reviews", () => {
    const summary = executionSummary();
    expect(summary.todayTasks.map((item) => item.title)).toEqual(expect.arrayContaining(["旧任务", "Build dashboard", "Daily note"]));
    expect(summary.unfinishedTasks.map((item) => item.title)).toContain("Old task");
    expect(summary.routeProgress[0]).toMatchObject({
      currentTheme: "Dashboard 闭环",
      keyTask: "打通执行闭环",
      status: "进行中"
    });
    expect(summary.blockers.find((item) => item.problem === "Parser blocked")?.count).toBe(2);
    expect(summary.evidence.map((item) => item.title)).toContain("demo link");
    expect(summary.pendingReviews[0]).toMatchObject({ reviewPath: "reviews/demo.md", status: "missing" });
    expect(summary.suggestions.map((item) => item.id)).toEqual(expect.arrayContaining(["blocker-adjustment", "unfinished-plan-adjustment", "review-adjustment"]));
  });

  it("generates plan, log, review, and route adjustment files without overwriting existing content", () => {
    const plan = createPlanFromRoute({ routePath: "routes/demo.md", week: "2026-W26" });
    expect(plan).toMatchObject({ path: "plans/2026-W26.md", existed: false });
    expect(fs.readFileSync(path.join(tempRoot, "plans", "2026-W26.md"), "utf8")).toContain("`routes/demo.md`");

    const existingPlan = createPlanFromRoute({ routePath: "routes/demo.md", week: "2026-W26" });
    expect(existingPlan.existed).toBe(true);

    const log = createLogFromPlan({ planPath: "plans/2026-W26.md", date: "2026-06-19" });
    expect(log).toMatchObject({ path: "logs/2026-06-19.md", existed: false });
    expect(fs.readFileSync(path.join(tempRoot, "logs", "2026-06-19.md"), "utf8")).toContain("`plans/2026-W26.md`");

    const review = createReviewFromPlan({ planPath: "plans/2026-W26.md", week: "2026-W26" });
    expect(review).toMatchObject({ path: "reviews/2026-W26.md", existed: false });
    const reviewContent = fs.readFileSync(path.join(tempRoot, "reviews", "2026-W26.md"), "utf8");
    expect(reviewContent).toContain("`plans/2026-W26.md`");
    expect(reviewContent).toContain("| 来源 | 任务 | 结果 | 证据或产出 |");
    expect(reviewContent).toContain("| logs/2026-06-17.md | Build dashboard | Done | demo link |");

    const adjustment = applyRouteAdjustment({
      routePath: "routes/demo.md",
      date: "2026-06-19",
      suggestion: "本周先少做一点",
      reason: "存在未完成计划"
    });
    expect(adjustment.backup).toContain(".backups/study-gui");
    const route = fs.readFileSync(path.join(tempRoot, "routes", "demo.md"), "utf8");
    expect(route).toContain("| 2026-06-19 | 本周先少做一点 | 存在未完成计划 |");
  });
});
