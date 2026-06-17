# Contributing

Study Route Framework is a local-first Markdown management system. Contributions should keep the framework reusable and avoid adding personal learning data to the public repository.

## Development Setup

Requirements:

- Node.js 22 or newer
- npm
- Windows PowerShell for the provided wrapper scripts

Install dependencies:

```powershell
npm.cmd install
```

Run the local development server:

```powershell
npm.cmd run dev
```

Run the production server after building:

```powershell
npm.cmd run build
npm.cmd run start
```

## Data Roots

The framework reads Markdown from one active data root:

1. `STUDY_ROUTE_DATA_DIR`, when set.
2. `demo-data/`, when the environment variable is not set.

Do not commit private notes, personal PDFs, `.env`, `.backups/`, `.trash/`, `private-data/`, or `local-data/` to this repository.

## Validation

Run the full local validation set before opening a pull request:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

The build may warn when frontend chunks exceed Vite's default size threshold. Treat new warnings or failures as review blockers unless they are understood and documented.

## Code Guidelines

- Prefer small, reviewable diffs.
- Keep framework code separate from private learning content.
- Keep API request and response types in `types/` aligned with backend and frontend usage.
- Add or update tests for backend behavior, store behavior, and user-facing workflow changes.
- Use environment variables for API keys and secrets; never commit credentials.
- Keep generated content deterministic where possible.

## Pull Request Checklist

- [ ] The change is scoped to framework code, templates, docs, or demo data.
- [ ] Private data and credentials are not included.
- [ ] `npm.cmd run typecheck` passes.
- [ ] `npm.cmd test` passes.
- [ ] `npm.cmd run build` passes.
- [ ] Documentation is updated when behavior or commands change.

## Commit Style

Use concise commit messages that describe the behavior change, for example:

```text
Add markdown draft version export
Harden LLM prompt constraints
Fix preview scroll synchronization
```
