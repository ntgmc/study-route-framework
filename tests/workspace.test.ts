import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { doctorReport, healthReport, migrateWorkspace } from "../src/backend/workspace.js";

let tempRoot = "";

function write(filePath: string, content: string) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

beforeEach(() => {
  tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "study-route-workspace-"));
  process.env.STUDY_ROUTE_DATA_DIR = tempRoot;
  write(path.join(tempRoot, "dashboard.md"), "# Dashboard\n\n![missing](attachments/missing.png)\n");
  write(path.join(tempRoot, "plans", "demo.md"), "# Demo Plan\n\n[bad](../outside.md)\n");
  write(path.join(tempRoot, "routes", "a.md"), "---\nid: duplicate\ntype: route\nschema_version: 1\n---\n# A\n");
  write(path.join(tempRoot, "routes", "b.md"), "---\nid: duplicate\ntype: route\nschema_version: 1\n---\n# B\n");
  write(path.join(tempRoot, "reviews", "bad.md"), "---\nid: bad\n# Bad\n");
  write(path.join(tempRoot, "attachments", "2026", "06", "orphan.png"), "x");
});

afterEach(() => {
  delete process.env.STUDY_ROUTE_DATA_DIR;
  fs.rmSync(tempRoot, { recursive: true, force: true });
});

describe("workspace health and migration", () => {
  it("reports legacy workspace issues", () => {
    const report = healthReport();
    expect(report.schema_version).toBe(0);
    expect(report.issues.map((issue) => issue.code)).toEqual(expect.arrayContaining([
      "manifest_missing",
      "front_matter_missing_field",
      "duplicate_id",
      "front_matter_invalid",
      "link_broken",
      "attachment_orphan"
    ]));
    expect(report.stats.duplicate_ids).toBe(1);
    expect(report.stats.orphan_attachments).toBe(1);
  });

  it("dry-runs migration without writing files", () => {
    const before = fs.readFileSync(path.join(tempRoot, "plans", "demo.md"), "utf8");
    const report = migrateWorkspace({ dryRun: true });
    expect(report.dry_run).toBe(true);
    expect(report.actions.some((action) => action.action === "create_manifest")).toBe(true);
    expect(fs.existsSync(path.join(tempRoot, ".study-route", "workspace.json"))).toBe(false);
    expect(fs.readFileSync(path.join(tempRoot, "plans", "demo.md"), "utf8")).toBe(before);
  });

  it("migrates legacy files idempotently and keeps backups", () => {
    const first = migrateWorkspace();
    expect(first.dry_run).toBe(false);
    expect(fs.existsSync(path.join(tempRoot, ".study-route", "workspace.json"))).toBe(true);
    expect(fs.readFileSync(path.join(tempRoot, "plans", "demo.md"), "utf8")).toContain("schema_version: 1");
    expect(first.backups.some((item) => item.includes("plans/demo.md"))).toBe(true);

    const second = migrateWorkspace();
    expect(second.actions.filter((action) => action.path === "plans/demo.md")).toHaveLength(0);
  });

  it("builds a doctor report from the same health checks", () => {
    const report = doctorReport();
    expect(report.dataRoot).toBe(tempRoot);
    expect(report.checks.map((check) => check.name)).toContain("health");
    expect(report.health.issues.length).toBeGreaterThan(0);
  });
});
