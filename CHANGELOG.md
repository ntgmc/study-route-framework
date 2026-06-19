# Changelog

All notable changes to Study Route Framework are documented here.

This project follows a lightweight changelog format. Dates use `YYYY-MM-DD`. Unreleased entries describe changes already merged into the repository but not yet assigned to a dated release.

## Unreleased

### Added

- React + TypeScript Web GUI for browsing, editing, previewing, creating, renaming, archiving, searching, and dashboard-focused Markdown workflows.
- CodeMirror 6 Markdown editor with toolbar actions, split preview, preview-only mode, keyboard shortcuts, snippet completion, and attachment insertion.
- IndexedDB draft support with recent draft versions, local file metadata, tags, favorites, pinned files, draft comparison, and draft export.
- Local-first Express API and TypeScript CLI backed by Markdown files under the active data root.
- Managed sections for dashboard, goals, routes, plans, logs, reviews, projects, records, resources, exams, and templates.
- Workspace schema health checks, doctor output, migration tooling, and machine-readable `--json` command output.
- Workspace visibility in the UI so users can confirm active data mode, data root, and framework root before editing.
- Attachment storage under `attachments/YYYY/MM/` inside the active data root, with Markdown links inserted by the editor.
- AI-assisted Markdown generation with constrained prompts, untrusted context boundaries, provider visibility, and environment-variable secret handling.
- Workspace AI settings saved per data root for non-secret provider fields.
- Multi-provider OpenAI-compatible AI generation, including DeepSeek, OpenAI, OpenRouter, SiliconFlow, Ollama, LM Studio, and custom endpoints.
- Auditable AI workflow surfaces that show provider, model, target URL, file path, prompt size, and editor-context inclusion before generation.
- Dashboard execution-loop workflows for focus fields, next action, progress rows, daily log append, generated weekly plans, and review creation.
- Service Worker static asset caching with network-first navigation.
- Git snapshot and Markdown metadata support for local draft/version workflows.
- POSIX shell launchers and Linux/macOS usage documentation for CLI and Web GUI startup.
- GitHub Actions CI for typecheck, tests, and production build.
- Unit, integration, API contract, path safety, Markdown parser, preview, workspace, CLI, and Playwright editor-flow tests.
- Open-source project files: `LICENSE`, `CONTRIBUTING.md`, and this changelog.

### Changed

- Replaced the legacy Python Web GUI with the TypeScript backend and React frontend.
- Updated documentation around the public framework repository and private `my-study-route` data repository split.
- Updated Chinese and English documentation to point to the TypeScript frontend/backend layout and wrapper scripts.
- Improved dashboard information hierarchy and daily workflow guidance.
- Improved preview/editor scroll synchronization in split and preview modes.
- Improved Markdown file summaries so YAML front matter is hidden from summary text.
- Clarified local AI provider setup and disabled-AI behavior.
- Stabilized Playwright app initialization for E2E editor tests.

### Fixed

- Fixed invalid navigation from the first task in the execution list.
- Fixed dashboard synchronization for completed tasks sourced from logs and reviews.
- Fixed Markdown preview behavior when files start with YAML front matter.
- Fixed generated review output missing the expected key-output table header.
- Fixed backend path handling edge cases around unsafe request paths, create targets, and rename targets.
- Fixed documentation examples so public README content does not expose absolute local paths.

### Security

- Hardened backend request limits and path validation for workspace file operations.
- Added negative tests for unsafe paths, unsafe create targets, unsafe rename targets, and API contract boundaries.
- Kept API keys out of repository files, workspace settings, browser storage, and demo data; secrets remain environment-variable only.
- Added prompt boundaries for AI generation so workspace content and editor context are treated as untrusted input.

### Removed

- Removed the legacy Python Web GUI entrypoint and package under `scripts/web_gui.py` and `scripts/study_route_gui/`.

### Known Issues

- The production frontend build currently emits Vite's default chunk-size warning. The app still builds successfully; future work should split heavier editor and AI paths into async chunks.
