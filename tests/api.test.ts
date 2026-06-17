import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/backend/app.js";

let tempRoot = "";

function write(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "study-route-api-"));
  process.env.STUDY_ROUTE_DATA_DIR = tempRoot;
  delete process.env.DEEPSEEK_API_KEY;
  write(path.join(tempRoot, "dashboard.md"), "# Dashboard\n\n## 当前焦点\n\n- 主目标：A\n- 当前阶段：B\n- 本周重点：C\n- 今日任务：D\n");
  write(path.join(tempRoot, "plans", "demo.md"), "# Demo\n\nhello api");
});

afterEach(() => {
  delete process.env.STUDY_ROUTE_DATA_DIR;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("api", () => {
  it("serves summary, files, file, search, and mutations", async () => {
    const app = createApp();
    const summary = await request(app).get("/api/summary").expect(200);
    expect(summary.body.dataMode).toBe("external");

    const files = await request(app).get("/api/files?section=plans").expect(200);
    expect(files.body.files[0].path).toBe("plans/demo.md");

    const file = await request(app).get("/api/file?path=plans/demo.md").expect(200);
    expect(file.body.content).toContain("hello api");

    const search = await request(app).get("/api/search?q=api").expect(200);
    expect(search.body.results[0].path).toBe("plans/demo.md");

    const saved = await request(app).post("/api/file").send({ path: "plans/demo.md", content: "# Demo\n\nsaved" }).expect(200);
    expect(saved.body.backup).toContain(".backups/study-gui");

    const created = await request(app).post("/api/create").send({ section: "plans", title: "Created", name: "" }).expect(201);
    expect(created.body.meta.path).toBe("plans/Created.md");

    const renamed = await request(app).post("/api/rename").send({ path: "plans/Created.md", name: "renamed.md" }).expect(200);
    expect(renamed.body.meta.path).toBe("plans/renamed.md");

    const archived = await request(app).post("/api/archive").send({ path: "plans/renamed.md" }).expect(200);
    expect(archived.body.archived_to).toContain(".trash/study-gui");
  });

  it("reports ai status and rejects generation without key", async () => {
    const app = createApp();
    const status = await request(app).get("/api/ai/status").expect(200);
    expect(status.body.configured).toBe(false);
    await request(app).post("/api/ai/generate").send({ prompt: "test" }).expect(428);
  });
});
