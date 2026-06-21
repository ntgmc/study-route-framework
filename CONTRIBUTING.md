# Contributing

Study Route Framework is a local-first Markdown management system. Contributions should keep the framework reusable, private-data-safe, and easy to run from a fresh clone.

This public repository contains framework code, reusable templates, documentation, and demo data only. Personal learning content belongs in a separate private data root such as `my-study-route`.

## Ways To Contribute

- Fix bugs in the Web GUI, Express API, TypeScript CLI, templates, or documentation.
- Improve local-first workflows for routes, plans, logs, reviews, projects, records, resources, and exam notes.
- Add tests for existing behavior, especially path safety, workspace mutations, Markdown parsing, and editor workflows.
- Improve cross-platform startup scripts without changing the data-root contract.
- Refine demo data when it clarifies framework behavior and does not include personal content.

Before starting larger changes, open or update an issue with the problem, expected behavior, and proposed scope. Small fixes can go straight to a pull request.

## Repository Layout

| Path | Purpose |
| --- | --- |
| `src/backend/` | Express API, workspace access, Markdown store, AI workflow, attachment handling |
| `src/frontend/` | React, Vite, CodeMirror, Zustand, and UI styles |
| `src/cli/` | TypeScript CLI entrypoint used by platform wrapper scripts |
| `types/` | Shared API, CLI, and domain types |
| `templates/` | Reusable Markdown templates copied into workspaces |
| `demo-data/` | Public sample workspace used when `STUDY_ROUTE_DATA_DIR` is not set |
| `scripts/` | PowerShell and POSIX launchers plus helper scripts |
| `tests/` | Vitest unit/integration tests and Playwright E2E tests |

## Development Setup

Requirements:

- Node.js 22 or newer
- npm
- Windows PowerShell for the Windows wrapper scripts
- POSIX shell for Linux/macOS wrapper scripts

Install dependencies:

```powershell
npm.cmd install
```

Run the API and Vite development server:

```powershell
npm.cmd run dev
```

The Vite development URL is:

```text
http://127.0.0.1:5173
```

Build and run the production server:

```powershell
npm.cmd run build
npm.cmd run start
```

The wrapper scripts start the local Web GUI on the production server path and default to `http://127.0.0.1:8765`:

```powershell
.\scripts\study-gui.ps1
```

```sh
sh scripts/study-gui.sh
```

## Data Roots And Privacy

The framework reads and writes Markdown from one active data root:

1. `STUDY_ROUTE_DATA_DIR`, when set.
2. `demo-data/`, when the environment variable is not set.

Keep this boundary intact. Framework changes must not require users to place private notes inside the public repository.

Do not commit:

- `.env` files or credentials
- API keys, tokens, private keys, cookies, or session dumps
- personal routes, notes, PDFs, screenshots, attachments, or progress data
- `.backups/`, `.trash/`, `private-data/`, or `local-data/`
- generated local caches that are not intentionally part of the framework

AI provider API keys must come from environment variables. Workspace AI settings stored under `.study-route/ai-config.json` may contain non-secret fields only, such as provider, base URL, model, timeout, token limit, temperature, and enabled state.

## Development Workflow

1. Start from an up-to-date branch.
2. Keep the diff focused on one behavior or documentation topic.
3. Search the repository before introducing a new helper, config key, path, API field, or command.
4. Update shared types in `types/` when API request or response shapes change.
5. Add or update tests that cover the changed behavior.
6. Update `README.md`, `README.zh-CN.md`, `scripts/README.md`, or `CONTRIBUTING.md` when commands, workflows, safety guarantees, or user-visible behavior change.
7. Use a clear conventional commit prefix so CI-generated release notes are grouped correctly.

Use concise branch names. Examples:

```text
fix/path-validation
feat/workspace-health-json
docs/ai-provider-setup
test/editor-rename-flow
```

## Code Guidelines

- Prefer small, reviewable diffs.
- Keep framework code separate from private learning content.
- Preserve the local-first data-root model and avoid mandatory network calls.
- Keep API request and response types in `types/` aligned with backend, frontend, and tests.
- Validate filesystem paths at backend boundaries before reading, writing, renaming, archiving, or serving files.
- Keep generated content deterministic where practical.
- Add explicit error handling for user-facing failures.
- Avoid broad refactors unless they are necessary for the behavior change.
- Use environment variables for secrets; never commit credentials or example secrets that look real.

## Frontend Guidelines

- Match the existing React, TypeScript, Zustand, CodeMirror, Tailwind, and CSS patterns.
- Keep editor and preview workflows responsive for large Markdown files.
- Preserve accessibility basics: visible focus states, labels for controls, keyboard-friendly dialogs, and readable status messages.
- Use existing API helpers and shared types rather than duplicating fetch contracts.
- Confirm that important editing flows still work after UI changes: open, edit, save, preview, create, rename, archive, search, and attachment upload.

## Backend And CLI Guidelines

- Treat all workspace paths from requests or CLI arguments as untrusted input.
- Keep operations inside the active data root.
- Preserve managed-section rules for `dashboard.md` and Markdown files under supported section directories.
- Write backups before overwriting existing Markdown where the current behavior requires it.
- Keep CLI output stable enough for scripts, especially for `--json` commands.
- Prefer structured parsing and serialization over ad hoc string manipulation when updating Markdown tables or front matter.

## Testing And Validation

Run the fastest relevant check first while developing. Before opening a pull request, run the full local validation set:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Use Playwright for user-facing editor flows:

```powershell
npm.cmd run test:e2e
```

When changing only documentation, a Markdown diff review is usually enough. If documentation changes include commands, run or verify the referenced commands where practical.

The production build may warn when frontend chunks exceed Vite's default size threshold. The current warning is documented in the changelog. Treat new warnings or failures as review blockers unless they are understood and documented.

## Pull Request Checklist

- [ ] The change is scoped to framework code, templates, docs, tests, scripts, or public demo data.
- [ ] Private data, credentials, and local-only files are not included.
- [ ] User-visible behavior changes are documented.
- [ ] `types/` are updated when API, CLI, or domain contracts change.
- [ ] Relevant unit, integration, or E2E tests are added or updated.
- [ ] `npm.cmd run typecheck` passes when code changes are included.
- [ ] `npm.cmd test` passes when code changes are included.
- [ ] `npm.cmd run build` passes when frontend, backend, or shared TypeScript changes are included.
- [ ] `npm.cmd run test:e2e` is run or explicitly skipped with a reason when editor workflows change.
- [ ] Commit messages use release-note-friendly prefixes when the change is notable.

## Commit Style

Use concise commit messages that describe the behavior change. Conventional prefixes are welcome but not required.

Examples:

```text
Add markdown draft version export
Harden workspace path validation
Fix preview scroll synchronization
docs: clarify private data root setup
test: cover editor rename flow
```

## Release Notes

Do not hand-maintain per-release entries in `CHANGELOG.md`. CI generates release changelogs from commit history when the `Release` workflow publishes a GitHub Release.

Use commit message prefixes to control the generated changelog sections. This works for pull request merges and direct commits.

- `feat:` or `feature:` for new functionality.
- `fix:`, `bugfix:`, or `hotfix:` for fixes.
- `security:` for path safety, secret handling, prompt-boundary, or data-exposure hardening.
- `docs:` or `doc:` for docs-only changes.
- `test:` or `tests:` for test coverage changes.
- `chore:`, `ci:`, `build:`, `perf:`, `refactor:`, `style:`, `deps:`, or `maintenance:` for maintenance work.
- Add `!` before the colon, such as `feat!:` or `refactor(api)!:`, or include `BREAKING CHANGE` in the subject for breaking changes.

Release tags must match `package.json`, for example `v2.0.0` for version `2.0.0`. The release workflow runs typecheck, tests, build, E2E, and dependency audit before generating notes and creating or updating the GitHub Release.
