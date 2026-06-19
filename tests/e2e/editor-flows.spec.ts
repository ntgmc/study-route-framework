import { expect, test } from "@playwright/test";
import {
  appendEditorText,
  editorText,
  openPlan,
  resetE2eWorkspace,
  writeAiOperation
} from "./fixtures/workspace";

test.beforeEach(async ({ page }) => {
  resetE2eWorkspace();
  await page.goto("/");
});

test("edits, saves, and reloads a markdown file", async ({ page }) => {
  await openPlan(page, "plans/demo.md");

  const uniqueLine = `E2E saved line ${Date.now()}`;
  await appendEditorText(page, uniqueLine);
  await expect(page.getByTestId("save-state")).toHaveAttribute("data-save-state", "dirty");

  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-state")).toHaveAttribute("data-save-state", "saved");

  await page.getByTestId("file-item-plans/second.md").click();
  await expect(page.getByTestId("current-file-path")).toContainText("plans/second.md");
  await page.getByTestId("file-item-plans/demo.md").click();
  await expect(page.getByTestId("current-file-path")).toContainText("plans/demo.md");
  await expect.poll(() => editorText(page)).toContain(uniqueLine);
});

test("protects unsaved edits when switching files", async ({ page }) => {
  await openPlan(page, "plans/demo.md");
  await appendEditorText(page, `Unsaved switch guard ${Date.now()}`);
  await expect(page.getByTestId("save-state")).toHaveAttribute("data-save-state", "dirty");

  await page.getByTestId("file-item-plans/second.md").click();
  await expect(page.getByTestId("toast-message")).toBeVisible();
  await page.getByTestId("toast-cancel").click();
  await expect(page.getByTestId("current-file-path")).toContainText("plans/demo.md");

  await page.getByTestId("file-item-plans/second.md").click();
  await page.getByTestId("toast-confirm").click();
  await expect(page.getByTestId("current-file-path")).toContainText("plans/second.md");
});

test("restores and discards local drafts", async ({ page, context }) => {
  await openPlan(page, "plans/demo.md");
  const draftLine = `E2E draft line ${Date.now()}`;
  await appendEditorText(page, draftLine);
  await page.waitForTimeout(1100);

  await page.close({ runBeforeUnload: false });
  const restoredPage = await context.newPage();
  await restoredPage.goto("/");
  await expect(restoredPage.getByTestId("toast-message")).toBeVisible();
  await restoredPage.getByTestId("toast-action-restore").click();
  await expect.poll(() => editorText(restoredPage)).toContain(draftLine);

  await restoredPage.close({ runBeforeUnload: false });
  const discardPage = await context.newPage();
  await discardPage.goto("/");
  await expect(discardPage.getByTestId("toast-message")).toBeVisible();
  await discardPage.getByTestId("toast-action-discard").click();
  await expect.poll(() => editorText(discardPage)).not.toContain(draftLine);
  await expect.poll(() => editorText(discardPage)).toContain("Initial plan body.");
});

test("renders markdown preview and returns to edit mode", async ({ page }) => {
  await openPlan(page, "plans/demo.md");

  await appendEditorText(page, "\n# Preview Heading\n\n- Preview item");
  await page.getByTestId("editor-mode-preview").click();
  await expect(page.getByTestId("markdown-preview").getByRole("heading", { name: "Preview Heading" })).toBeVisible();
  await expect(page.getByTestId("markdown-preview").getByText("Preview item")).toBeVisible();

  await page.getByTestId("editor-mode-edit").click();
  await expect.poll(() => editorText(page)).toContain("Preview Heading");
});

test("applies a mocked AI draft to the editor and saves through the real file API", async ({ page }) => {
  const operationId = "ai_e2e_mock";
  const aiContent = `- AI generated E2E task ${Date.now()}`;
  writeAiOperation(operationId, aiContent);

  await page.route("**/api/ai/status", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        api_version: 1,
        enabled: true,
        configured: true,
        provider: "Mock",
        provider_id: "custom",
        model: "mock-model",
        base_url: "https://llm.example.test/v1",
        max_tokens: 1000,
        temperature: 0.2,
        required_env: "LLM_API_KEY",
        local_provider: false,
        settings: {
          enabled: true,
          provider: "custom",
          baseUrl: "https://llm.example.test/v1",
          model: "mock-model",
          timeout: 30,
          maxTokens: 1000,
          temperature: 0.2,
          workspacePrompt: "",
          promptTemplates: []
        },
        config_source: "environment",
        env_overrides: [],
        required_key_env: "LLM_API_KEY",
        api_key_detected: true,
        context_limits: { prompt_chars: 4000, context_chars: 12000 },
        sends_context_fields: ["mode", "actionId", "prompt", "section", "path", "context", "applyMode"],
        actions: [{ id: "current_file_to_tasks", label: "Current file to tasks", description: "E2E" }]
      })
    });
  });

  await page.route("**/api/ai/history**", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ api_version: 1, operations: [], warnings: [] }) });
  });

  await page.route("**/api/ai/operations/*/apply", async (route) => {
    await route.fulfill({ contentType: "application/json", body: JSON.stringify({ api_version: 1, ok: true }) });
  });

  await page.route("**/api/ai/generate", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        api_version: 1,
        ok: true,
        provider: "Mock",
        model: "mock-model",
        content: aiContent,
        operation_id: operationId,
        diff: { added: 1, removed: 0, changed: 1, preview: `+${aiContent}` },
        request_context: {
          action_id: "current_file_to_tasks",
          action_label: "Current file to tasks",
          apply_mode: "append",
          section: "plans",
          path: "plans/demo.md",
          context_source: "current_file",
          prompt: "Create an E2E task",
          context_excerpt: "",
          prompt_chars: 18,
          context_chars: 0
        },
        sources: [{ kind: "model_inference", label: "Mock", detail: "E2E", chars: aiContent.length }],
        base_hash: "e2e",
        created_at: new Date().toISOString(),
        usage: { total_tokens: 1 }
      })
    });
  });

  await openPlan(page, "plans/demo.md");
  await page.getByTestId("ai-open-button").click();
  await expect(page.getByTestId("ai-dialog")).toBeVisible();
  await page.getByTestId("ai-prompt").fill("Create an E2E task");
  await page.getByTestId("ai-generate-button").click();
  await page.getByTestId("ai-apply-button").click();

  await expect.poll(() => editorText(page)).toContain(aiContent);
  await page.getByTestId("save-button").click();
  await expect(page.getByTestId("save-state")).toHaveAttribute("data-save-state", "saved");
});
