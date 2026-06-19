import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import type { AttachmentUploadResponse } from "../../types/api.js";
import { API_VERSION } from "../../types/domain.js";
import { resolveDataConfig } from "./config.js";

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function attachmentRoot(): string {
  return path.join(resolveDataConfig().dataRoot, "attachments");
}

function posixRelative(root: string, target: string): string {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("附件路径不在数据目录内");
  return rel.split(path.sep).join("/");
}

function safeName(value: string): string {
  const parsed = path.parse(value.trim().replace(/\\/g, "/").split("/").pop() || "attachment");
  const base = (parsed.name || "attachment").replace(/[<>:"|?*\x00-\x1f]/g, "").replace(/\s+/g, "-").replace(/^[. -]+|[. -]+$/g, "") || "attachment";
  const ext = parsed.ext.replace(/[<>:"|?*\x00-\x1f]/g, "").slice(0, 20);
  return `${base.slice(0, 80)}${ext}`;
}

function markdownFor(filePath: string, name: string, mimeType: string): string {
  const escapedName = name.replace(/[\[\]]/g, "");
  return mimeType.startsWith("image/")
    ? `![${escapedName}](${filePath})`
    : `[${escapedName}](${filePath})`;
}

export function saveAttachment(fileName: string, body: Buffer, mimeType: string): AttachmentUploadResponse {
  if (!body.length) throw new Error("附件内容为空");
  if (body.length > MAX_ATTACHMENT_BYTES) {
    const error = new Error("附件超过 25 MB 限制");
    Object.assign(error, { statusCode: 413 });
    throw error;
  }
  const now = new Date();
  const folder = path.join(attachmentRoot(), String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, "0"));
  const cleanName = safeName(fileName);
  const target = path.join(folder, `${crypto.randomBytes(4).toString("hex")}-${cleanName}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
  const rel = `attachments/${posixRelative(attachmentRoot(), target)}`;
  return {
    ok: true,
    path: rel,
    markdown: markdownFor(rel, cleanName, mimeType),
    size: body.length,
    mime_type: mimeType
  };
}

export function sendAttachmentPath(value: string, response: Response): void {
  const root = attachmentRoot();
  const target = path.resolve(root, value);
  posixRelative(root, target);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.status(404).json({ api_version: API_VERSION, error: "附件不存在" });
    return;
  }
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'");
  response.sendFile(target);
}

export function sendAttachment(request: Request, response: Response): void {
  sendAttachmentPath(String(request.params[0] ?? ""), response);
}
