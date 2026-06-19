import express, { type Request, type Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
import { aiStatus, generateMarkdown, LlmConfigError, LlmRequestError } from "./llm.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function resolvePublicDir(): string {
  const candidates = [
    path.resolve(currentDir, "..", "..", "..", "public"),
    path.resolve(process.cwd(), "dist", "public"),
    path.resolve(process.cwd(), "src", "frontend")
  ];
  return candidates.find((candidate) => fs.existsSync(path.join(candidate, "index.html"))) ?? candidates[0];
}

function sendError(response: Response, status: number, message: string): void {
  response.status(status).json({ error: message });
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

  app.get("/api/summary", (_request, response) => response.json(repoSummary()));
  app.get("/api/files", (request, response) => {
    const section = asString(request.query.section) || "dashboard";
    const q = asString(request.query.q);
    const sort = asString(request.query.sort) === "name" ? "name" : "updated";
    response.json({ files: listMarkdownFiles(section, q, sort) });
  });
  app.get("/api/file", (request, response) => response.json(getFile(asString(request.query.path))));
  app.get("/api/search", (request, response) => response.json({ results: searchFiles(asString(request.query.q)) }));
  app.get("/api/ai/status", (_request, response) => response.json(aiStatus()));

  app.post("/api/file", (request, response) => {
    response.json(saveFile(asString(request.body?.path), asString(request.body?.content)));
  });
  app.post("/api/create", (request, response) => {
    response.status(201).json(createFile(asString(request.body?.section), asString(request.body?.title), asString(request.body?.name)));
  });
  app.post("/api/rename", (request, response) => {
    response.json(renameFile(asString(request.body?.path), asString(request.body?.name)));
  });
  app.post("/api/archive", (request, response) => {
    response.json(archiveFile(asString(request.body?.path)));
  });
  app.post("/api/dashboard/focus", (request, response) => {
    response.json(updateDashboardFocus(stringRecord(request.body)));
  });
  app.post("/api/logs/daily", (request, response) => {
    response.json(appendDailyLog(stringRecord(request.body)));
  });
  app.post("/api/plans/from-route", (request, response) => {
    response.status(201).json(createPlanFromRoute(stringRecord(request.body)));
  });
  app.post("/api/logs/from-plan", (request, response) => {
    response.status(201).json(createLogFromPlan(stringRecord(request.body)));
  });
  app.post("/api/reviews/from-plan", (request, response) => {
    response.status(201).json(createReviewFromPlan(stringRecord(request.body)));
  });
  app.post("/api/routes/adjustment", (request, response) => {
    response.json(applyRouteAdjustment(stringRecord(request.body)));
  });
  app.post("/api/ai/generate", async (request, response, next) => {
    try {
      response.json(await generateMarkdown(stringRecord(request.body)));
    } catch (error) {
      next(error);
    }
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
    sendError(response, 400, error instanceof Error ? error.message : "请求失败");
  });

  return app;
}
