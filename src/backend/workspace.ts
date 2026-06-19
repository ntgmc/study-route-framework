import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type {
  DoctorReport,
  HealthIssue,
  HealthReport,
  MigrationAction,
  MigrationReport,
  WorkspaceManifest
} from "../../types/domain.js";
import { WORKSPACE_SCHEMA_VERSION } from "../../types/domain.js";
import { ignoredDirs, managedDirs, sections } from "../shared/sections.js";
import { resolveDataConfig } from "./config.js";
import { ensureRecommendedFrontMatter, sectionFromRelativePath, sectionToDocumentType } from "./documentModel.js";
import { parseFrontMatter, parseMarkdownDocument } from "./markdownParser.js";

const WORKSPACE_DIR = ".study-route";
const MANIFEST_FILE = "workspace.json";
const WORKSPACE_SUBDIRS = ["history", "indexes", "migrations"];

interface ManifestReadResult {
  schemaVersion: number;
  manifest?: WorkspaceManifest;
  error?: string;
}

function config() {
  return resolveDataConfig();
}

function posixRelative(root: string, target: string): string {
  const rel = path.relative(path.resolve(root), path.resolve(target));
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error("Path is outside the workspace data root");
  }
  return rel.split(path.sep).join("/");
}

function pathParts(rel: string): string[] {
  return rel.split(/[\\/]+/).filter(Boolean);
}

function manifestPath(): string {
  return path.join(config().dataRoot, WORKSPACE_DIR, MANIFEST_FILE);
}

function readPackageVersion(): string {
  try {
    const packageFile = path.join(config().frameworkRoot, "package.json");
    const parsed = JSON.parse(fs.readFileSync(packageFile, "utf8")) as { version?: unknown };
    return typeof parsed.version === "string" ? parsed.version : "0.0.0";
  } catch {
    return "0.0.0";
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function newManifest(existing?: WorkspaceManifest): WorkspaceManifest {
  const now = nowIso();
  return {
    schema_version: WORKSPACE_SCHEMA_VERSION,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    framework_version: readPackageVersion()
  };
}

export function readWorkspaceManifest(): ManifestReadResult {
  const filePath = manifestPath();
  if (!fs.existsSync(filePath)) return { schemaVersion: 0 };
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as Partial<WorkspaceManifest>;
    const schemaVersion = typeof parsed.schema_version === "number" ? parsed.schema_version : 0;
    return {
      schemaVersion,
      manifest: {
        schema_version: schemaVersion,
        created_at: String(parsed.created_at ?? ""),
        updated_at: String(parsed.updated_at ?? ""),
        framework_version: String(parsed.framework_version ?? "")
      }
    };
  } catch (error) {
    return { schemaVersion: 0, error: error instanceof Error ? error.message : "Invalid workspace manifest" };
  }
}

export function currentWorkspaceSchemaVersion(): number {
  return readWorkspaceManifest().schemaVersion;
}

function writeManifest(manifest: WorkspaceManifest): void {
  const filePath = manifestPath();
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  for (const folder of WORKSPACE_SUBDIRS) {
    fs.mkdirSync(path.join(config().dataRoot, WORKSPACE_DIR, folder), { recursive: true });
  }
  fs.writeFileSync(filePath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

function walkFiles(base: string, predicate: (filePath: string) => boolean): string[] {
  if (!fs.existsSync(base)) return [];
  const entries = fs.readdirSync(base, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    if (ignoredDirs.has(entry.name)) continue;
    const target = path.join(base, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(target, predicate));
    } else if (entry.isFile() && predicate(target)) {
      files.push(target);
    }
  }
  return files;
}

function managedMarkdownFiles(): string[] {
  const { dataRoot } = config();
  const files: string[] = [];
  const dashboard = path.join(dataRoot, "dashboard.md");
  if (fs.existsSync(dashboard)) files.push(dashboard);
  for (const folder of [...managedDirs].sort()) {
    files.push(...walkFiles(path.join(dataRoot, folder), (filePath) => filePath.endsWith(".md")));
  }
  return files.sort((left, right) => posixRelative(dataRoot, left).localeCompare(posixRelative(dataRoot, right)));
}

function attachmentFiles(): string[] {
  return walkFiles(path.join(config().dataRoot, "attachments"), () => true);
}

function addIssue(issues: HealthIssue[], issue: HealthIssue): void {
  issues.push(issue);
}

function linkTargets(text: string): string[] {
  const targets: string[] = [];
  const pattern = /!?\[[^\]]*]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    targets.push(match[1]);
  }
  return targets;
}

function isExternalLink(value: string): boolean {
  return /^(https?:|mailto:|data:|#)/i.test(value);
}

function normalizeLink(value: string): string {
  return decodeURIComponent(value.split("#")[0].split("?")[0]);
}

function hasUtf8ReplacementChar(text: string): boolean {
  return text.includes("\uFFFD");
}

export function healthReport(): HealthReport {
  const { dataRoot, frameworkRoot } = config();
  const manifest = readWorkspaceManifest();
  const issues: HealthIssue[] = [];
  if (manifest.error) {
    addIssue(issues, { severity: "error", code: "manifest_invalid", message: manifest.error, path: `${WORKSPACE_DIR}/${MANIFEST_FILE}` });
  } else if (!manifest.manifest) {
    addIssue(issues, {
      severity: "warning",
      code: "manifest_missing",
      message: "Workspace manifest is missing; treating this as legacy schema 0.",
      path: `${WORKSPACE_DIR}/${MANIFEST_FILE}`
    });
  } else if (manifest.schemaVersion < WORKSPACE_SCHEMA_VERSION) {
    addIssue(issues, {
      severity: "warning",
      code: "manifest_outdated",
      message: `Workspace schema ${manifest.schemaVersion} is older than ${WORKSPACE_SCHEMA_VERSION}.`,
      path: `${WORKSPACE_DIR}/${MANIFEST_FILE}`
    });
  } else if (manifest.schemaVersion > WORKSPACE_SCHEMA_VERSION) {
    addIssue(issues, {
      severity: "warning",
      code: "manifest_newer",
      message: `Workspace schema ${manifest.schemaVersion} is newer than this framework supports.`,
      path: `${WORKSPACE_DIR}/${MANIFEST_FILE}`
    });
  }

  if (!fs.existsSync(path.join(dataRoot, "dashboard.md"))) {
    addIssue(issues, { severity: "warning", code: "dashboard_missing", message: "dashboard.md is missing.", path: "dashboard.md" });
  }
  for (const section of sections.filter((item) => item.kind === "folder" && item.key !== "templates")) {
    const folder = path.join(dataRoot, section.path);
    if (!fs.existsSync(folder)) {
      addIssue(issues, { severity: "warning", code: "managed_dir_missing", message: `${section.path}/ is missing.`, path: section.path });
    }
  }
  const templateRoot = path.join(frameworkRoot, "templates");
  if (!fs.existsSync(templateRoot) || !walkFiles(templateRoot, (filePath) => filePath.endsWith(".md")).length) {
    addIssue(issues, { severity: "error", code: "templates_missing", message: "Framework templates are missing.", path: "templates" });
  }

  const byId = new Map<string, string[]>();
  const referenced = new Set<string>();
  let brokenLinks = 0;
  const files = managedMarkdownFiles();
  for (const filePath of files) {
    const rel = posixRelative(dataRoot, filePath);
    let text = "";
    try {
      text = fs.readFileSync(filePath, "utf8");
    } catch (error) {
      addIssue(issues, { severity: "error", code: "file_unreadable", message: String(error), path: rel });
      continue;
    }
    if (hasUtf8ReplacementChar(text)) {
      addIssue(issues, { severity: "warning", code: "encoding_suspect", message: "File contains Unicode replacement characters.", path: rel });
    }
    const parsed = parseMarkdownDocument(text);
    if (parsed.frontMatterError) {
      addIssue(issues, { severity: "error", code: "front_matter_invalid", message: parsed.frontMatterError, path: rel });
    }
    const expectedSection = sectionFromRelativePath(rel);
    const expectedType = expectedSection === "unknown" ? undefined : sectionToDocumentType(expectedSection);
    for (const field of ["id", "type", "schema_version"] as const) {
      if (parsed.frontMatter[field] === undefined) {
        addIssue(issues, { severity: "warning", code: "front_matter_missing_field", message: `Missing front matter field: ${field}.`, path: rel });
      }
    }
    if (expectedType && parsed.frontMatter.type && parsed.frontMatter.type !== expectedType) {
      addIssue(issues, {
        severity: "warning",
        code: "front_matter_type_mismatch",
        message: `Expected type ${expectedType}, got ${parsed.frontMatter.type}.`,
        path: rel
      });
    }
    if (typeof parsed.frontMatter.id === "string" && parsed.frontMatter.id.trim()) {
      const current = byId.get(parsed.frontMatter.id) ?? [];
      current.push(rel);
      byId.set(parsed.frontMatter.id, current);
    }

    for (const rawTarget of linkTargets(text)) {
      if (isExternalLink(rawTarget)) continue;
      const target = normalizeLink(rawTarget);
      if (!target) continue;
      const resolved = path.resolve(path.dirname(filePath), target);
      let relTarget = "";
      try {
        relTarget = posixRelative(dataRoot, resolved);
      } catch {
        brokenLinks += 1;
        addIssue(issues, { severity: "warning", code: "link_outside_workspace", message: `Link points outside workspace: ${rawTarget}`, path: rel });
        continue;
      }
      referenced.add(relTarget);
      if (!fs.existsSync(resolved)) {
        brokenLinks += 1;
        addIssue(issues, { severity: "warning", code: "link_broken", message: `Linked file does not exist: ${rawTarget}`, path: rel });
      }
    }
  }

  let duplicateIds = 0;
  for (const [id, paths] of byId) {
    if (paths.length <= 1) continue;
    duplicateIds += 1;
    for (const rel of paths) {
      addIssue(issues, { severity: "error", code: "duplicate_id", message: `Duplicate document id: ${id}`, path: rel });
    }
  }

  const attachments = attachmentFiles();
  let orphanAttachments = 0;
  for (const filePath of attachments) {
    const rel = posixRelative(dataRoot, filePath);
    if (!referenced.has(rel)) {
      orphanAttachments += 1;
      addIssue(issues, { severity: "warning", code: "attachment_orphan", message: "Attachment is not referenced by any managed Markdown file.", path: rel });
    }
  }

  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    schema_version: manifest.schemaVersion,
    issues,
    stats: {
      files: files.length,
      managed_files: files.length,
      attachments: attachments.length,
      orphan_attachments: orphanAttachments,
      duplicate_ids: duplicateIds,
      broken_links: brokenLinks
    }
  };
}

function backupFile(filePath: string, stamp: string): string {
  const { dataRoot } = config();
  const backup = path.join(dataRoot, ".backups", "study-migrate", stamp, posixRelative(dataRoot, filePath));
  fs.mkdirSync(path.dirname(backup), { recursive: true });
  fs.copyFileSync(filePath, backup);
  return posixRelative(dataRoot, backup);
}

function actionForMarkdown(filePath: string): MigrationAction | null {
  const rel = posixRelative(config().dataRoot, filePath);
  const text = fs.readFileSync(filePath, "utf8");
  const parsed = parseMarkdownDocument(text);
  if (parsed.frontMatterError) {
    return { path: rel, action: "skip", message: `Skipped invalid front matter: ${parsed.frontMatterError}` };
  }
  const next = ensureRecommendedFrontMatter(text, rel);
  if (next === text) return null;
  return {
    path: rel,
    action: parsed.rawFrontMatter ? "update_front_matter" : "add_front_matter",
    message: parsed.rawFrontMatter ? "Update recommended front matter fields." : "Add recommended front matter."
  };
}

export function migrateWorkspace(options: { dryRun?: boolean } = {}): MigrationReport {
  const dryRun = options.dryRun === true;
  const { dataRoot } = config();
  const before = readWorkspaceManifest();
  const actions: MigrationAction[] = [];
  const backups: string[] = [];
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");

  const nextManifest = newManifest(before.manifest);
  const manifestFile = manifestPath();
  const manifestAction: MigrationAction = fs.existsSync(manifestFile)
    ? { path: `${WORKSPACE_DIR}/${MANIFEST_FILE}`, action: "update_manifest", message: "Update workspace schema manifest." }
    : { path: `${WORKSPACE_DIR}/${MANIFEST_FILE}`, action: "create_manifest", message: "Create workspace schema manifest." };
  if (!before.manifest || before.schemaVersion !== WORKSPACE_SCHEMA_VERSION) actions.push(manifestAction);

  for (const filePath of managedMarkdownFiles()) {
    const action = actionForMarkdown(filePath);
    if (action) actions.push(action);
  }

  if (!dryRun) {
    if (actions.some((action) => action.path === `${WORKSPACE_DIR}/${MANIFEST_FILE}`)) {
      if (fs.existsSync(manifestFile)) backups.push(backupFile(manifestFile, stamp));
      writeManifest(nextManifest);
    }
    for (const action of actions) {
      if (!action.path.endsWith(".md") || action.action === "skip") continue;
      const filePath = path.join(dataRoot, ...pathParts(action.path));
      backups.push(backupFile(filePath, stamp));
      const text = fs.readFileSync(filePath, "utf8");
      fs.writeFileSync(filePath, ensureRecommendedFrontMatter(text, action.path), "utf8");
    }
  }

  const health = healthReport();
  return {
    ok: !actions.some((action) => action.action === "skip") && health.ok,
    dry_run: dryRun,
    from_schema_version: before.schemaVersion,
    to_schema_version: WORKSPACE_SCHEMA_VERSION,
    actions,
    backups,
    health
  };
}

function checkWritable(): boolean {
  const probe = path.join(config().dataRoot, WORKSPACE_DIR, ".write-test");
  try {
    fs.mkdirSync(path.dirname(probe), { recursive: true });
    fs.writeFileSync(probe, "ok", "utf8");
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function gitStatusMessage(dataRoot: string): string {
  if (!fs.existsSync(path.join(dataRoot, ".git"))) return "Data root is not a Git repository.";
  try {
    const output = execFileSync("git", ["-C", dataRoot, "status", "--short"], { encoding: "utf8" }).trim();
    return output ? `Git has uncommitted changes:\n${output}` : "Git working tree is clean.";
  } catch (error) {
    return `Unable to read Git status: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export function doctorReport(): DoctorReport {
  const data = config();
  const manifest = readWorkspaceManifest();
  const health = healthReport();
  const checks = [
    { name: "data_root_exists", ok: fs.existsSync(data.dataRoot), message: data.dataRoot },
    { name: "framework_root_exists", ok: fs.existsSync(data.frameworkRoot), message: data.frameworkRoot },
    { name: "data_root_writable", ok: checkWritable(), message: checkWritable() ? "Data root is writable." : "Data root is not writable." },
    {
      name: "workspace_schema",
      ok: manifest.schemaVersion === WORKSPACE_SCHEMA_VERSION,
      message: `Current schema ${manifest.schemaVersion}; supported schema ${WORKSPACE_SCHEMA_VERSION}.`
    },
    {
      name: "templates",
      ok: fs.existsSync(path.join(data.frameworkRoot, "templates")),
      message: path.join(data.frameworkRoot, "templates")
    },
    {
      name: "git",
      ok: true,
      message: gitStatusMessage(data.dataRoot)
    },
    {
      name: "health",
      ok: health.ok,
      message: `${health.issues.length} health issue(s) found.`
    }
  ];
  return {
    ok: checks.every((check) => check.ok),
    dataRoot: data.dataRoot,
    frameworkRoot: data.frameworkRoot,
    dataMode: data.dataMode,
    schema_version: manifest.schemaVersion,
    checks,
    health
  };
}

export function assertFrontMatterParse(text: string): void {
  parseFrontMatter(text);
}
