import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";

export const e2eDataDir = path.resolve(".tmp", "e2e-data", "default");

function write(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content.replace(/\r?\n/g, "\n"), "utf8");
}

export function resetE2eWorkspace(): void {
  fs.rmSync(e2eDataDir, { recursive: true, force: true });
  fs.mkdirSync(e2eDataDir, { recursive: true });

  write(
    path.join(e2eDataDir, "dashboard.md"),
    `# E2E Dashboard

## Current Focus

- Main goal: Verify editor flows
- Current stage: E2E
- Weekly focus: Stable regression coverage
- Today: Edit and save
`
  );

  write(
    path.join(e2eDataDir, "plans", "demo.md"),
    `---
id: plan:e2e-demo
type: plan
schema_version: 2
title: E2E Demo Plan
created: 2026-06-19
updated: 2026-06-19
tags: [e2e]
favorite: false
pinned: false
---
# E2E Demo Plan

Initial plan body.
`
  );

  write(
    path.join(e2eDataDir, "plans", "second.md"),
    `---
id: plan:e2e-second
type: plan
schema_version: 2
title: E2E Second Plan
created: 2026-06-19
updated: 2026-06-19
tags: []
favorite: false
pinned: false
---
# E2E Second Plan

Second plan body.
`
  );

  write(
    path.join(e2eDataDir, "routes", "demo.md"),
    `---
id: route:e2e-demo
type: route
schema_version: 2
title: E2E Route
created: 2026-06-19
updated: 2026-06-19
tags: []
favorite: false
pinned: false
---
# E2E Route

| Stage | Theme | Key task | Output | Acceptance | Status |
| --- | --- | --- | --- | --- | --- |
| 1 | E2E | Cover editor flows | Tests | Passing CI | Active |
`
  );
}

export function writeAiOperation(id: string, content: string): void {
  const now = new Date().toISOString();
  const historyFile = path.join(e2eDataDir, ".study-route", "history", "ai-operations.jsonl");
  fs.mkdirSync(path.dirname(historyFile), { recursive: true });
  fs.appendFileSync(
    historyFile,
    `${JSON.stringify({
      id,
      status: "generated",
      action_id: "current_file_to_tasks",
      action_label: "Current file to tasks",
      provider: "Mock",
      model: "mock-model",
      section: "plans",
      path: "plans/demo.md",
      apply_mode: "append",
      base_hash: "e2e",
      created_at: now,
      updated_at: now,
      diff: { added: 1, removed: 0, changed: 1, preview: `+${content}` },
      request_context: {
        action_id: "current_file_to_tasks",
        action_label: "Current file to tasks",
        apply_mode: "append",
        section: "plans",
        path: "plans/demo.md",
        context_source: "current_file",
        prompt: "E2E prompt",
        context_excerpt: "",
        prompt_chars: 10,
        context_chars: 0
      },
      sources: [{ kind: "model_inference", label: "Mock", detail: "E2E", chars: content.length }]
    })}\n`,
    "utf8"
  );
}

export async function openPlan(page: Page, pathValue: string): Promise<void> {
  await page.getByTestId("section-plans").click();
  await page.getByTestId(`file-item-${pathValue}`).click();
  await page.getByTestId("current-file-path").waitFor();
}

export async function editorText(page: Page): Promise<string> {
  return page.getByTestId("editor").locator(".cm-content").innerText();
}

export async function appendEditorText(page: Page, text: string): Promise<void> {
  const editor = page.getByTestId("editor").locator(".cm-content");
  await editor.click();
  await page.keyboard.press("Control+End");
  await page.keyboard.insertText(`\n${text}`);
}
