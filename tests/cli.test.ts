import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let tempRoot = "";

function write(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

function runCli(args: string[]) {
  return execFileSync(process.execPath, ["--import", "tsx", "src/cli/study.ts", ...args], {
    cwd: process.cwd(),
    env: { ...process.env, STUDY_ROUTE_DATA_DIR: tempRoot },
    encoding: "utf8"
  }).trim();
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "study-route-cli-"));
  write(
    path.join(tempRoot, "dashboard.md"),
    `# Dashboard

## 当前焦点

- 主目标：A
- 当前阶段：B
- 本周重点：C
- 今日任务：D

| 项目 | 状态 | 当前阶段 | 下一里程碑 | 更新时间 |
| --- | --- | --- | --- | --- |
`
  );
});

afterEach(() => {
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("cli", () => {
  it("creates and appends logs", () => {
    expect(runCli(["init-log", "--date", "2026-06-17"])).toBe("logs/2026-06-17.md");
    expect(
      runCli([
        "add-log",
        "--date",
        "2026-06-17",
        "--done",
        "Task|Done|1h|logs/2026-06-17.md",
        "--takeaway",
        "Note",
        "--problem",
        "Problem|Judge|Next",
        "--next",
        "Tomorrow"
      ])
    ).toBe("logs/2026-06-17.md");
    const content = fs.readFileSync(path.join(tempRoot, "logs", "2026-06-17.md"), "utf8");
    expect(content).toContain("| Task | Done | 1h | logs/2026-06-17.md |");
    expect(content).toContain("| Problem | Judge | Next |");
    expect(content).toContain("- Note");
    expect(content).toContain("- Tomorrow");
  });

  it("updates records, dashboard, and week plans", () => {
    expect(runCli(["leetcode", "--topic", "Array", "--title", "Two Sum"])).toBe("records/leetcode.md");
    expect(runCli(["exam-review", "--subject", "Math", "--actual", "2h"])).toBe("records/exam-review.md");
    expect(runCli(["dashboard", "--today", "Ship migration", "--progress", "TS|Doing|API|UI"])).toBe("dashboard.md");
    expect(runCli(["week-plan", "--week", "2026-W26", "--theme", "Migration", "--hours", "3h"])).toBe("plans/2026-W26.md");
    expect(runCli(["week-plan", "--week", "2026-W26", "--theme", "Migration", "--hours", "4h", "--force"])).toBe("plans/2026-W26.md");

    expect(fs.readFileSync(path.join(tempRoot, "dashboard.md"), "utf8")).toContain("- 今日任务：Ship migration");
    expect(fs.readFileSync(path.join(tempRoot, "plans", "2026-W26.md"), "utf8")).toContain("计划总时长：4h");
  });
});
