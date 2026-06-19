import express, { type Request, type Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  API_VERSION,
  type HealthReport
} from "../../types/domain.js";
import {
  appendDailyLog,
  applyRouteAdjustment,
  archiveFile,
  createFile,
  createLogFromPlan,
  createPlanFromRoute,
  createReviewFromPlan,
  getFile,
  listMarkdownFiles,
  renameFile,
  repoSummary,
  saveFile,
  searchFiles,
  updateDashboardFocus
} from "./markdownStore.js";
import { MAX_ATTACHMENT_BYTES, saveAttachment, sendAttachmentPath } from "./attachments.js";
import { aiSettings, aiStatus, generateMarkdown, LlmConfigError, LlmRequestError, saveAiSettings } from "./llm.js";
import { currentWorkspaceSchemaVersion, healthReport } from "./workspace.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function resolvePublicDir(): string {
  const candidates = [
    path.resolve(currentDir, "..", "..", "..", "public"),
    path.resolve(process.cwd(), "dist", "public"),
    path.resolve(process.cwd(), "src", "frontend")
  ];
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, "index.html"))) ?? candidates[0];
}

function versioned<T extends object>(payload: T, includeWorkspace = true): T & { api_version: number; workspace_schema_version?: number } {
  return {
    ...payload,
    api_version: API_VERSION,
    ...(includeWorkspace ? { workspace_schema_version: currentWorkspaceSchemaVersion() } : {})
  };
}

function sendError(response: Response, status: number, message: string): void {
  response.status(status).json({ api_version: API_VERSION, error: message });
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, String(item ?? "")]));
}

export function createApp() {
  const app = express();
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/summary", (_request, response) => response.json(versioned(repoSummary() as unknown as Record<string, unknown>)));
  app.get("/api/health", (_request, response) => response.json(versioned(healthReport() as HealthReport & Record<string, unknown>)));
  app.get("/api/files", (request, response) => {
    const section = asString(request.query.section) || "dashboard";
    const q = asString(request.query.q);
    const sort = asString(request.query.sort) === "name" ? "name" : "updated";
    response.json(versioned({ files: listMarkdownFiles(section, q, sort) }));
  });
  app.get("/api/file", (request, response) => response.json(versioned(getFile(asString(request.query.path)) as unknown as Record<string, unknown>)));
  app.get("/api/search", (request, response) => response.json(versioned({ results: searchFiles(asString(request.query.q)) })));
  app.get("/api/ai/status", (_request, response) => response.json(versioned(aiStatus() as unknown as Record<string, unknown>, false)));
  app.get("/api/ai/settings", (_request, response) => response.json(versioned(aiSettings() as unknown as Record<string, unknown>, false)));

  app.post("/api/file", (request, response) => {
    response.json(versioned(saveFile(asString(request.body?.path), asString(request.body?.content))));
  });
  app.put("/api/ai/settings", (request, response) => {
    response.json(versioned(saveAiSettings(request.body) as unknown as Record<string, unknown>, false));
  });
  app.post("/api/create", (request, response) => {
    response.status(201).json(versioned(createFile(asString(request.body?.section), asString(request.body?.title), asString(request.body?.name))));
  });
  app.post("/api/rename", (request, response) => {
    response.json(versioned(renameFile(asString(request.body?.path), asString(request.body?.name))));
  });
  app.post("/api/archive", (request, response) => {
    response.json(versioned(archiveFile(asString(request.body?.path))));
  });
  app.post("/api/dashboard/focus", (request, response) => {
    response.json(versioned(updateDashboardFocus(stringRecord(request.body))));
  });
  app.post("/api/logs/daily", (request, response) => {
    response.json(versioned(appendDailyLog(stringRecord(request.body))));
  });
  app.post("/api/plans/from-route", (request, response) => {
    response.status(201).json(versioned(createPlanFromRoute(stringRecord(request.body))));
  });
  app.post("/api/logs/from-plan", (request, response) => {
    response.status(201).json(versioned(createLogFromPlan(stringRecord(request.body))));
  });
  app.post("/api/reviews/from-plan", (request, response) => {
    response.status(201).json(versioned(createReviewFromPlan(stringRecord(request.body))));
  });
  app.post("/api/routes/adjustment", (request, response) => {
    response.json(versioned(applyRouteAdjustment(stringRecord(request.body))));
  });
  app.post("/api/ai/generate", async (request, response, next) => {
    try {
      response.json(versioned(await generateMarkdown(stringRecord(request.body)) as unknown as Record<string, unknown>, false));
    } catch (error) {
      next(error);
    }
  });
  app.post("/api/attachments", express.raw({ type: "application/octet-stream", limit: MAX_ATTACHMENT_BYTES }), (request, response) => {
    if (!Buffer.isBuffer(request.body)) throw new Error("附件请求体必须是 application/octet-stream");
    response.status(201).json(versioned(saveAttachment(asString(request.header("X-File-Name")) || asString(request.query.name) || "attachment", request.body, asString(request.header("X-File-Mime")) || asString(request.header("Content-Type")) || "application/octet-stream")));
  });
  app.use((request, response, next) => {
    const rawPath = request.originalUrl.split("?")[0];
    if (request.method !== "GET" || !rawPath.toLowerCase().startsWith("/attachments/")) {
      next();
      return;
    }
    const attachmentPath = decodeURIComponent(rawPath.slice("/attachments/".length));
    sendAttachmentPath(attachmentPath, response);
  });
  app.use("/attachments", (request, response, next) => {
    if (request.method !== "GET") {
      next();
      return;
    }
    const attachmentPath = decodeURIComponent(request.path.replace(/^\/+/, ""));
    if (!attachmentPath) {
      response.status(404).json({ api_version: API_VERSION, error: "附件不存在" });
      return;
    }
    sendAttachmentPath(attachmentPath, response);
  });

  const publicDir = resolvePublicDir();
  app.use(express.static(publicDir));
  app.use((request: Request, response: Response, next) => {
    if (request.method !== "GET") {
      next();
      return;
    }
    response.sendFile(path.join(publicDir, "index.html"));
  });

  app.use((error: unknown, _request: Request, response: Response, _next: express.NextFunction) => {
    if (error instanceof LlmConfigError) {
      sendError(response, 428, error.message);
      return;
    }
    if (error instanceof LlmRequestError) {
      sendError(response, 502, error.message);
      return;
    }
    const status = typeof (error as { status?: unknown }).status === "number"
      ? (error as { status: number }).status
      : typeof (error as { statusCode?: unknown }).statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 400;
    sendError(response, status, error instanceof Error ? error.message : "请求失败");
  });

  return app;
}
