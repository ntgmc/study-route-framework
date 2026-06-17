import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DataMode } from "../../types/domain.js";

export const DATA_ENV_VAR = "STUDY_ROUTE_DATA_DIR";

const currentDir = path.dirname(fileURLToPath(import.meta.url));

function hasFrameworkMarkers(candidate: string): boolean {
  return fs.existsSync(path.join(candidate, "demo-data")) && fs.existsSync(path.join(candidate, "templates"));
}

export function resolveFrameworkRoot(start = process.cwd()): string {
  const candidates = [
    path.resolve(start),
    path.resolve(currentDir, "..", "..", ".."),
    path.resolve(currentDir, "..", "..")
  ];
  for (const candidate of candidates) {
    if (hasFrameworkMarkers(candidate)) return candidate;
  }
  return path.resolve(start);
}

export interface DataConfig {
  frameworkRoot: string;
  dataRoot: string;
  dataMode: DataMode;
}

export function resolveDataConfig(): DataConfig {
  const frameworkRoot = resolveFrameworkRoot();
  const configured = (process.env[DATA_ENV_VAR] ?? "").trim();
  if (configured) {
    return {
      frameworkRoot,
      dataRoot: path.resolve(configured),
      dataMode: "external"
    };
  }
  return {
    frameworkRoot,
    dataRoot: path.resolve(frameworkRoot, "demo-data"),
    dataMode: "demo"
  };
}
