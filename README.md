# Study Route Framework

[English](README.md) | [简体中文](README.zh-CN.md)

Study Route Framework is a local-first Markdown management system for learning routes, plans, logs, reviews, projects, records, resources, and exam notes.

This public repository contains the reusable framework only:

- Web GUI and API in `src/backend/` and `src/frontend/`
- CLI helpers in `src/cli/study.ts`
- shared TypeScript API/domain types in `types/`
- reusable Markdown templates in `templates/`
- public demo data in `demo-data/`
- framework documentation

Personal learning content should live outside this public repository. The recommended private data repository is `my-study-route`.

## Repository Split

| Repository | Purpose | Visibility |
| --- | --- | --- |
| `study-route-framework` | Core management system, UI, API, CLI, templates, docs, demo data | public |
| `my-study-route` | Personal learning routes, notes, progress logs, records, resources | private |

## Data Root

The framework reads and writes Markdown through one data root.

Resolution order:

1. If `STUDY_ROUTE_DATA_DIR` is set, use that directory.
2. Otherwise use this repository's `demo-data/`.

That means a fresh public clone can run immediately with demo data, while personal data stays in a private repository.

The Web GUI shows the active data mode, data root, and framework root in the sidebar so you can confirm where files are written before editing.

Workspace AI settings are stored per data root in `.study-route/ai-config.json`. This file only stores non-secret fields such as provider, base URL, model, timeout, token limit, temperature, and enabled/disabled state. API keys still come only from environment variables.

Uploaded images, PDFs, and other attachments are copied into the active data root under `attachments/YYYY/MM/`. Markdown inserted by the editor points to that relative path, so files stay with the same learning workspace.

## Quick Start With Demo Data

From the framework repository:

Windows PowerShell:

```powershell
npm.cmd install
.\scripts\study-gui.ps1
```

Linux/macOS:

```sh
npm install
sh scripts/study-gui.sh
```

Default local address:

```text
http://127.0.0.1:8765
```

CLI commands also use `demo-data/` when no external data root is configured:

Windows PowerShell:

```powershell
.\scripts\study.ps1 init-log --date 2026-06-17
.\scripts\study.ps1 week-plan --week 2026-W26 --theme "Framework demo" --hours "3h"
```

Linux/macOS:

```sh
sh scripts/study.sh init-log --date 2026-06-17
sh scripts/study.sh week-plan --week 2026-W26 --theme "Framework demo" --hours "3h"
```

## Use A Private Data Repository

Create a private content repository with this structure:

```text
my-study-route/
|-- dashboard.md
|-- goals/
|-- routes/
|-- plans/
|-- logs/
|-- reviews/
|-- projects/
|-- records/
|-- resources/
`-- exams/
```

Then point the framework at it:

Windows PowerShell:

```powershell
$env:STUDY_ROUTE_DATA_DIR="D:\GITHOME\my-study-route"
D:\GITHOME\study-route-framework\scripts\study-gui.ps1
```

Linux/macOS:

```sh
export STUDY_ROUTE_DATA_DIR="$HOME/my-study-route"
sh /path/to/study-route-framework/scripts/study-gui.sh
```

The CLI uses the same environment variable:

Windows PowerShell:

```powershell
$env:STUDY_ROUTE_DATA_DIR="D:\GITHOME\my-study-route"
D:\GITHOME\study-route-framework\scripts\study.ps1 init-log
```

Linux/macOS:

```sh
export STUDY_ROUTE_DATA_DIR="$HOME/my-study-route"
sh /path/to/study-route-framework/scripts/study.sh init-log
```

## Managed Sections

The GUI and CLI manage these Markdown locations inside the active data root:

```text
dashboard.md
goals/
routes/
plans/
logs/
reviews/
projects/
records/
resources/
exams/
templates/
```

Only `dashboard.md` and Markdown files under managed section directories are editable through the API. Backups and archived files are written under the active data root:

```text
.backups/study-gui/
.trash/study-gui/
```

## Data Import And Export

The data model is plain Markdown files plus JSON API responses. Import/export can be done by copying directories, committing the private repository, or using the Web GUI/API to read and write Markdown content.

## Encoding And Line Endings

All text files in this repository should be saved as UTF-8 without BOM. The `.editorconfig` file enforces CRLF for common source and documentation files, and LF for POSIX shell scripts. The PowerShell launchers set console I/O to UTF-8 before starting the CLI or Web GUI.

If Chinese output looks garbled in Windows PowerShell, start the tool through `scripts/study.ps1` or `scripts/study-gui.ps1` so the UTF-8 console settings are applied.

Recommended workflow:

- Keep framework changes in `study-route-framework`.
- Keep personal routes, notes, records, PDFs, and progress data in `my-study-route`.
- Do not commit `.env`, `private-data/`, `local-data/`, `.backups/`, `.trash/`, or personal PDFs to the public framework repository.

## Optional AI Generation

The Web GUI can call OpenAI-compatible chat completion APIs when configured through environment variables. API keys are never saved by the framework, the data root, or browser storage. The AI dialog also shows the provider, model, target URL, current file path, prompt size, and whether editor content will be sent before you generate.

Provider-neutral configuration works with any compatible API:

```powershell
$env:LLM_PROVIDER="custom"
$env:LLM_API_KEY="your-api-key"
$env:LLM_BASE_URL="https://api.example.com/v1"
$env:LLM_MODEL="model-name"
.\scripts\study-gui.ps1
```

Linux/macOS:

```sh
export LLM_PROVIDER="custom"
export LLM_API_KEY="your-api-key"
export LLM_BASE_URL="https://api.example.com/v1"
export LLM_MODEL="model-name"
sh scripts/study-gui.sh
```

Built-in provider shortcuts are also supported:

- DeepSeek: `DEEPSEEK_API_KEY`, optional `DEEPSEEK_BASE_URL`, `DEEPSEEK_MODEL`
- OpenAI: `OPENAI_API_KEY`, optional `OPENAI_BASE_URL`, `OPENAI_MODEL`
- OpenRouter: `OPENROUTER_API_KEY`, optional `OPENROUTER_BASE_URL`, `OPENROUTER_MODEL`
- SiliconFlow: `SILICONFLOW_API_KEY`, optional `SILICONFLOW_BASE_URL`, `SILICONFLOW_MODEL`
- Ollama: `LLM_PROVIDER=ollama`, `OLLAMA_MODEL`, optional `OLLAMA_BASE_URL` defaulting to `http://127.0.0.1:11434/v1`
- LM Studio: `LLM_PROVIDER=lmstudio`, `LMSTUDIO_MODEL`, optional `LMSTUDIO_BASE_URL` defaulting to `http://127.0.0.1:1234/v1`

Local model examples:

```powershell
$env:LLM_PROVIDER="ollama"
$env:OLLAMA_MODEL="llama3.1"
.\scripts\study-gui.ps1
```

```sh
export LLM_PROVIDER="lmstudio"
export LMSTUDIO_MODEL="local-model"
sh scripts/study-gui.sh
```

To fully disable AI while keeping the editor usable:

```powershell
$env:LLM_DISABLED="1"
.\scripts\study-gui.ps1
```

You can also open the AI Provider settings from the Web GUI sidebar. Settings saved there apply only to the current `STUDY_ROUTE_DATA_DIR` and do not store API keys.

Global `LLM_*` variables override provider-specific variables:

- `LLM_PROVIDER`, one of `deepseek`, `openai`, `openrouter`, `siliconflow`, `custom`, `ollama`, `lmstudio`, `disabled`, `off`, or `none`
- `LLM_API_KEY`
- `LLM_BASE_URL`
- `LLM_MODEL`
- `LLM_DISABLED`, set to `1`, `true`, `yes`, or `on` to block AI requests
- `LLM_TIMEOUT`, default `60`
- `LLM_MAX_TOKENS`, default `1800`
- `LLM_TEMPERATURE`, default `0.4`

See `scripts/README.md` for command details.
