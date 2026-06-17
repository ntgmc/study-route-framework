# Changelog

All notable changes to Study Route Framework are documented here.

This project follows a lightweight changelog format. Dates use `YYYY-MM-DD`.

## Unreleased

### Added

- React + TypeScript Web GUI with Markdown browsing, editing, preview, create, rename, archive, search, and dashboard focus workflows.
- CodeMirror 6 Markdown editor with toolbar actions, split preview, preview-only mode, keyboard shortcuts, and snippet completion.
- IndexedDB drafts with recent draft versions, local file metadata, tags, favorites, pinned files, draft comparison, and draft export.
- Local-first Express API and TypeScript CLI backed by Markdown files under the active data root.
- DeepSeek-assisted Markdown generation with constrained prompts, untrusted context boundaries, and environment-variable configuration.
- Service Worker static asset caching with network-first navigation.
- GitHub Actions CI for typecheck, tests, and production build.
- Open-source project files: `LICENSE`, `CONTRIBUTING.md`, and this changelog.
- POSIX shell launchers and Linux/macOS usage documentation for CLI and Web GUI startup.

### Changed

- Replaced the legacy Python Web GUI with the TypeScript backend and React frontend.
- Improved preview/editor scroll synchronization in split and preview modes.
- Updated Chinese documentation to point to the TypeScript frontend/backend layout.

### Removed

- Removed the legacy Python Web GUI entrypoint and package under `scripts/web_gui.py` and `scripts/study_route_gui/`.

### Known Issues

- The production frontend build currently emits Vite's default chunk-size warning. The app still builds successfully; future work should split heavier editor and AI paths into async chunks.
