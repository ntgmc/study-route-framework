import fs from "node:fs";
import path from "node:path";

const e2eDataDir = path.resolve(".tmp", "e2e-data", "default");

function write(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content.replace(/\r?\n/g, "\n"), "utf8");
}

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
