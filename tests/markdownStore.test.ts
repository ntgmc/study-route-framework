import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveDataConfig } from "../src/backend/config.js";
import {
  appendDailyLog,
  archiveFile,
  createFile,
  getFile,
  isManagedPath,
  listMarkdownFiles,
  renameFile,
  saveFile,
  searchFiles,
  slugifyFilename,
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
  write(path.join(tempRoot, "plans", "demo.md"), "# Demo Plan\n\nBody keyword");
  write(path.join(tempRoot, "logs", "2026-06-17.md"), "# 学习记录\n\n## 今日完成\n\n| 任务 | 结果 | 用时 | 证据或产出 |\n| --- | --- | ---: | --- |\n\n## 关键收获\n\n## 明日计划\n");
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
    expect(getFile("plans/demo.md").content).toContain("Updated");

    const created = createFile("plans", "New Plan", "");
    expect(created.meta.path).toBe("plans/New-Plan.md");

    const renamed = renameFile(created.meta.path, "renamed.md");
    expect(renamed.meta.path).toBe("plans/renamed.md");

    expect(searchFiles("Updated")[0].path).toBe("plans/demo.md");

    const archived = archiveFile("plans/renamed.md");
    expect(archived.archived_to).toContain(".trash/study-gui");
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
});
