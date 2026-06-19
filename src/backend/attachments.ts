import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import type { AttachmentUploadResponse } from "../../types/api.js";
import { API_VERSION } from "../../types/domain.js";
import { resolveDataConfig } from "./config.js";

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const MAX_ATTACHMENT_SEGMENT_LENGTH = 120;

function attachmentRoot(): string {
  return path.join(resolveDataConfig().dataRoot, "attachments");
}

function hasUnsafeFilenameChar(value: string): boolean {
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 32 || code === 127 || "<>:\"|?*".includes(char)) return true;
  }
  return false;
}

function normalizeFilenamePart(value: string, fallback: string, maxLength: number): string {
  let output = "";
  let pendingDash = false;
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code < 32 || code === 127 || "<>:\"|?*".includes(char)) continue;
    if (char.trim() === "") {
      pendingDash = output.length > 0;
      continue;
    }
    if (pendingDash && output.length < maxLength && !output.endsWith("-")) output += "-";
    pendingDash = false;
    if (output.length < maxLength) output += char;
  }
  while (output.startsWith(".") || output.startsWith("-") || output.startsWith(" ")) output = output.slice(1);
  while (output.endsWith(".") || output.endsWith("-") || output.endsWith(" ")) output = output.slice(0, -1);
  return output || fallback;
}

function posixRelative(root: string, target: string): string {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Attachment path is outside the data directory");
  return rel.split(path.sep).join("/");
}

function pathSegments(value: string): string[] {
  const raw = value.trim();
  if (!raw || raw.length > 512 || path.isAbsolute(raw)) throw new Error("Invalid attachment path");
  const parts = raw.replaceAll("\\", "/").split("/");
  const clean: string[] = [];
  for (const part of parts) {
    if (!part || part === "." || part === ".." || part.length > MAX_ATTACHMENT_SEGMENT_LENGTH || hasUnsafeFilenameChar(part)) {
      throw new Error("Invalid attachment path");
    }
    clean.push(part);
  }
  return clean;
}

function attachmentTarget(parts: string[]): string {
  return path.join(attachmentRoot(), ...parts);
}

function safeName(value: unknown): string {
  const raw = typeof value === "string" ? value : "attachment";
  const leaf = raw.trim().replaceAll("\\", "/").split("/").filter(Boolean).pop() || "attachment";
  const dot = leaf.lastIndexOf(".");
  const hasExt = dot > 0 && dot < leaf.length - 1;
  const name = hasExt ? leaf.slice(0, dot) : leaf;
  const rawExt = hasExt ? leaf.slice(dot + 1) : "";
  const base = normalizeFilenamePart(name, "attachment", 80);
  const extName = normalizeFilenamePart(rawExt, "", 20);
  const ext = extName ? `.${extName}` : "";
  return `${base.slice(0, 80)}${ext}`;
}

function markdownFor(filePath: string, name: string, mimeType: string): string {
  const escapedName = [...name].filter((char) => char !== "[" && char !== "]").join("");
  return mimeType.toLocaleLowerCase().startsWith("image/")
    ? `![${escapedName}](${filePath})`
    : `[${escapedName}](${filePath})`;
}

export function saveAttachment(fileName: unknown, body: unknown, mimeType: unknown): AttachmentUploadResponse {
  if (!Buffer.isBuffer(body)) throw new Error("Attachment request body must be application/octet-stream");
  if (!body.length) throw new Error("Attachment content is empty");
  if (body.length > MAX_ATTACHMENT_BYTES) {
    const error = new Error("Attachment exceeds 25 MB limit");
    Object.assign(error, { statusCode: 413 });
    throw error;
  }
  const now = new Date();
  const cleanName = safeName(fileName);
  const storedName = `${crypto.randomBytes(4).toString("hex")}-${cleanName}`;
  const target = attachmentTarget([String(now.getFullYear()), String(now.getMonth() + 1).padStart(2, "0"), storedName]);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, body);
  const rel = `attachments/${posixRelative(attachmentRoot(), target)}`;
  const cleanMimeType = typeof mimeType === "string" && mimeType.trim() ? mimeType.trim().slice(0, 120) : "application/octet-stream";
  return {
    ok: true,
    path: rel,
    markdown: markdownFor(rel, cleanName, cleanMimeType),
    size: body.length,
    mime_type: cleanMimeType
  };
}

export function sendAttachmentPath(value: string, response: Response): void {
  const root = attachmentRoot();
  const target = path.join(root, ...pathSegments(value));
  posixRelative(root, target);
  if (!fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.status(404).json({ api_version: API_VERSION, error: "Attachment not found" });
    return;
  }
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self' data:; media-src 'self'; style-src 'unsafe-inline'");
  response.sendFile(target);
}

export function sendAttachment(request: Request, response: Response): void {
  sendAttachmentPath(String(request.params[0] ?? ""), response);
}
