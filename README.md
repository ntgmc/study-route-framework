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

## Everyday Usage

The framework is meant to be used from the Web GUI for reading and editing, with the CLI available for quick append-only updates.

Recommended daily flow:

1. Start the Web GUI and open `http://127.0.0.1:8765`.
2. Check the sidebar before editing. It shows whether you are using `demo-data/` or a private `STUDY_ROUTE_DATA_DIR`, plus the exact data root that will be written.
3. Use `总览` as the home screen. The `下一步` card opens the next useful action, such as generating a weekly plan, generating today's log, opening the current task source, or creating a review.
4. Use `手动维护` on the dashboard when you want to directly update the current focus fields or append a daily log entry without opening the Markdown file.
5. Open a section such as `routes`, `plans`, `logs`, `reviews`, `projects`, `records`, `resources`, or `exams` from the sidebar to browse files in that directory.
6. Select a file, edit Markdown in the editor, switch between edit, split preview, and preview modes, then click `保存`. Existing files are backed up under `.backups/study-gui/` before saving.
7. Click `新建` to create a Markdown file in a managed section. Use the current section unless you intentionally choose another one in the dialog.
8. Use `重命名` for file name changes and `归档` to move a file under `.trash/study-gui/`. `dashboard.md` cannot be renamed or archived.
9. Use `全局搜索` to find text across the active data root. Use `筛选当前分类`, sorting, tags, favorites, and pinned files to keep large sections manageable.
10. Use the attachment button in the editor to add images, PDFs, or other files. The file is copied to `attachments/YYYY/MM/` and a relative Markdown link is inserted.

Typical CLI use:

```powershell
.\scripts\study.ps1 init-log
.\scripts\study.ps1 add-log --done "Read chapter 1|Finished notes|45m|logs/2026-06-19.md" --takeaway "Summarize before coding" --next "Implement one exercise"
.\scripts\study.ps1 leetcode --topic "Array" --title "Two Sum" --difficulty "Easy" --result "Solved" --redo "No"
.\scripts\study.ps1 exam-review --subject "Calculus" --actual "2h" --done "Limits review" --problem "Careless algebra" --next "Redo wrong problems"
.\scripts\study.ps1 dashboard --today "Finish the API notes" --progress "Backend route|Doing|HTTP basics|Write examples"
```

Linux/macOS use the same arguments through `sh scripts/study.sh`.

The commands write to predictable files inside the active data root:

| Command | What it updates |
| --- | --- |
| `init-log` | Creates `logs/YYYY-MM-DD.md` if it does not already exist |
| `add-log` | Appends completed work, takeaways, problems, next steps, or notes to `logs/YYYY-MM-DD.md` |
| `leetcode` | Appends a row to `records/leetcode.md` |
| `exam-review` | Appends a row to `records/exam-review.md` |
| `dashboard` | Updates focus fields and progress rows in `dashboard.md` |
| `week-plan` | Creates or replaces `plans/YYYY-WNN.md` when `--force` is supplied |
| `health`, `doctor`, `migrate` | Check or migrate the active workspace; add `--json` for machine-readable output |

Use the GUI when you want to inspect or revise full documents. Use the CLI when you already know the small update you want to append.

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
$env:STUDY_ROUTE_DATA_DIR="$HOME\my-study-route"
.\scripts\study-gui.ps1
```

Linux/macOS:

```sh
export STUDY_ROUTE_DATA_DIR="$HOME/my-study-route"
sh /path/to/study-route-framework/scripts/study-gui.sh
```

The CLI uses the same environment variable:

Windows PowerShell:

```powershell
$env:STUDY_ROUTE_DATA_DIR="$HOME\my-study-route"
.\scripts\study.ps1 init-log
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
