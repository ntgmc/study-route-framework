import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const e2eDataDir = path.resolve(".tmp", "e2e-data", "default");

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  expect: {
    timeout: 8_000
  },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL: "http://127.0.0.1:5173",
    serviceWorkers: "block",
    trace: "retain-on-failure"
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] }
    }
  ],
  webServer: [
    {
      command: "node tests/e2e/setup-data.mjs && tsx src/backend/server.ts --host 127.0.0.1 --port 8765",
      url: "http://127.0.0.1:8765/api/health",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        STUDY_ROUTE_DATA_DIR: e2eDataDir,
        LLM_DISABLED: "1"
      }
    },
    {
      command: "vite --host 127.0.0.1 --port 5173",
      url: "http://127.0.0.1:5173",
      reuseExistingServer: !process.env.CI,
      timeout: 30_000
    }
  ]
});
