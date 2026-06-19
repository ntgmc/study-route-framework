import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { GitChangedFile, GitCommitResponse, GitStatusResponse } from "../../types/api.js";
import { resolveDataConfig } from "./config.js";

function dataRoot(): string {
  return resolveDataConfig().dataRoot;
}

function runGit(args: string[]): string {
  return execFileSync("git", ["-C", dataRoot(), ...args], { encoding: "utf8" }).trim();
}

function parseStatusLine(line: string): GitChangedFile | null {
  if (line.length < 4) return null;
  const index = line[0] || " ";
  const workingTree = line[1] || " ";
  const rawPath = line.slice(3).trim();
  if (!rawPath) return null;
  const renamed = rawPath.includes(" -> ") ? rawPath.split(" -> ").pop() ?? rawPath : rawPath;
  return { path: renamed.replace(/\\/g, "/"), index, workingTree };
}

function isConflict(file: GitChangedFile): boolean {
  return ["DD", "AU", "UD", "UA", "DU", "AA", "UU"].includes(`${file.index}${file.workingTree}`);
}

function defaultCommitMessage(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `study snapshot ${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function gitStatus(): GitStatusResponse {
  const root = dataRoot();
  if (!fs.existsSync(path.join(root, ".git"))) {
    return { isRepo: false, clean: true, files: [], conflicts: [], message: "Data root is not a Git repository." };
  }
  try {
    const branch = runGit(["branch", "--show-current"]) || runGit(["rev-parse", "--short", "HEAD"]);
    const output = runGit(["status", "--porcelain"]);
    const files = output ? output.split(/\r?\n/).map(parseStatusLine).filter((item): item is GitChangedFile => Boolean(item)) : [];
    const conflicts = files.filter(isConflict);
    return { isRepo: true, clean: files.length === 0, branch, files, conflicts };
  } catch (error) {
    return {
      isRepo: false,
      clean: true,
      files: [],
      conflicts: [],
      message: error instanceof Error ? error.message : String(error)
    };
  }
}

export function commitLearningSnapshot(message?: string): GitCommitResponse {
  const before = gitStatus();
  if (!before.isRepo) throw new Error(before.message || "Data root is not a Git repository.");
  if (before.conflicts.length) throw new Error("Git working tree has conflicts; resolve them before committing.");
  if (before.clean) {
    return { ok: true, committed: false, message: "No changes to commit.", status: before };
  }

  const commitMessage = message?.trim() || defaultCommitMessage();
  runGit(["add", "-A"]);
  runGit(["commit", "-m", commitMessage]);
  const hash = runGit(["rev-parse", "--short", "HEAD"]);
  return {
    ok: true,
    committed: true,
    message: commitMessage,
    hash,
    status: gitStatus()
  };
}
