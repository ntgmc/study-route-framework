# Study Route Scripts

This directory contains lightweight automation for the Study Route Framework.

All commands read and write the active data root:

1. `STUDY_ROUTE_DATA_DIR`, when set.
2. `demo-data/` in the framework repository, when the environment variable is not set.

## Configure A Private Data Root

PowerShell example:

```powershell
$env:STUDY_ROUTE_DATA_DIR="D:\GITHOME\my-study-route"
```

Linux/macOS example:

```sh
export STUDY_ROUTE_DATA_DIR="$HOME/my-study-route"
```

Then run GUI or CLI commands from the public framework repository:

Windows PowerShell:

```powershell
npm.cmd install
.\scripts\study-gui.ps1
.\scripts\study.ps1 init-log
```

Linux/macOS:

```sh
npm install
sh scripts/study-gui.sh
sh scripts/study.sh init-log
```

Unset the variable to return to public demo data:

Windows PowerShell:

```powershell
Remove-Item Env:\STUDY_ROUTE_DATA_DIR
```

Linux/macOS:

```sh
unset STUDY_ROUTE_DATA_DIR
```

## Web GUI

The Web GUI is implemented with React, TypeScript, Vite, CodeMirror 6, Tailwind CSS, and an Express API. `study-gui.ps1` and `study-gui.sh` build the frontend when `dist/public/index.html` is missing, then start the local server.

Start the local Web GUI:

Windows PowerShell:

```powershell
.\scripts\study-gui.ps1
```

Linux/macOS:

```sh
sh scripts/study-gui.sh
```

Default address:

```text
http://127.0.0.1:8765
```

Common parameters:

Windows PowerShell:

```powershell
.\scripts\study-gui.ps1 --port 8787
.\scripts\study-gui.ps1 --host 127.0.0.1 --port 8765
```

Linux/macOS:

```sh
sh scripts/study-gui.sh --port 8787
sh scripts/study-gui.sh --host 127.0.0.1 --port 8765
```

The GUI supports:

- browsing managed sections under the active data root
- editing and saving Markdown files
- creating, renaming, and archiving Markdown files
- switching between editor and preview
- full-text search
- updating `dashboard.md` focus fields
- appending daily logs
- optional AI-assisted Markdown generation through OpenAI-compatible APIs

Before saving an existing file, the GUI writes a backup under:

```text
.backups/study-gui/
```

Archived files are moved under:

```text
.trash/study-gui/
```

Both paths are relative to the active data root.

For active development, run the API and Vite dev server together:

Windows PowerShell:

```powershell
npm.cmd run dev
```

Linux/macOS:

```sh
npm run dev
```

The Vite development URL is:

```text
http://127.0.0.1:5173
```

## AI Generation

The GUI does not store API keys in the framework, data root, or browser storage. Set provider variables in the terminal before startup. The AI dialog shows which provider, URL, file path, prompt size, and editor context will be sent before generation.

The Web GUI also has an AI Provider settings dialog. It saves non-secret settings per data root at `.study-route/ai-config.json`; environment variables still override saved settings and API keys are never written there.

Generic OpenAI-compatible API:

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

Provider-specific shortcuts:

```powershell
$env:DEEPSEEK_API_KEY="your-api-key"
$env:DEEPSEEK_MODEL="deepseek-v4-flash"
```

```powershell
$env:OPENAI_API_KEY="your-api-key"
$env:OPENAI_MODEL="gpt-4o-mini"
```

```powershell
$env:OPENROUTER_API_KEY="your-api-key"
$env:OPENROUTER_MODEL="openai/gpt-4o-mini"
```

```powershell
$env:SILICONFLOW_API_KEY="your-api-key"
$env:SILICONFLOW_MODEL="deepseek-ai/DeepSeek-V3"
```

Local OpenAI-compatible providers do not require an API key:

```powershell
$env:LLM_PROVIDER="ollama"
$env:OLLAMA_MODEL="llama3.1"
.\scripts\study-gui.ps1
```

```powershell
$env:LLM_PROVIDER="lmstudio"
$env:LMSTUDIO_MODEL="local-model"
.\scripts\study-gui.ps1
```

Linux/macOS:

```sh
export LLM_PROVIDER="ollama"
export OLLAMA_MODEL="llama3.1"
sh scripts/study-gui.sh
```

To disable AI requests completely:

```powershell
$env:LLM_DISABLED="1"
.\scripts\study-gui.ps1
```

Global options:

```powershell
$env:LLM_TIMEOUT="60"
$env:LLM_MAX_TOKENS="1800"
$env:LLM_TEMPERATURE="0.4"
```

`LLM_PROVIDER` also accepts `ollama`, `lmstudio`, `disabled`, `off`, or `none`. `LLM_DISABLED=1` takes precedence over provider selection.

## Attachments

The editor upload button copies selected images, PDFs, and other files into the active data root:

```text
attachments/YYYY/MM/
```

The GUI inserts a relative Markdown image or link, for example `![diagram](attachments/2026/06/abcd1234-diagram.png)`. Attachment uploads are limited to 25 MB and are served only from the active data root.

## CLI Commands

The platform wrappers call the TypeScript CLI through npm:

- Windows PowerShell: `.\scripts\study.ps1`
- Linux/macOS: `sh scripts/study.sh`

Create today's learning log:

Windows PowerShell:

```powershell
.\scripts\study.ps1 init-log
```

Linux/macOS:

```sh
sh scripts/study.sh init-log
```

Append completed items, takeaways, and next steps:

Windows PowerShell:

```powershell
.\scripts\study.ps1 add-log `
  --done "Task|Result|1h|records/example.md" `
  --takeaway "Key takeaway" `
  --next "Next action"
```

Linux/macOS:

```sh
sh scripts/study.sh add-log \
  --done "Task|Result|1h|records/example.md" \
  --takeaway "Key takeaway" \
  --next "Next action"
```

Append a LeetCode record:

Windows PowerShell:

```powershell
.\scripts\study.ps1 leetcode `
  --topic "Linked list" `
  --title "Reverse Linked List" `
  --difficulty "Easy" `
  --result "Solved independently" `
  --redo "Yes" `
  --note "Review iterative and recursive forms"
```

Linux/macOS:

```sh
sh scripts/study.sh leetcode \
  --topic "Linked list" \
  --title "Reverse Linked List" \
  --difficulty "Easy" \
  --result "Solved independently" \
  --redo "Yes" \
  --note "Review iterative and recursive forms"
```

Append an exam review record:

Windows PowerShell:

```powershell
.\scripts\study.ps1 exam-review `
  --subject "Calculus" `
  --planned "2h" `
  --actual "2h" `
  --done "Finished typical limit and integral problems" `
  --problem "Detail mistakes" `
  --next "Redo wrong problems"
```

Linux/macOS:

```sh
sh scripts/study.sh exam-review \
  --subject "Calculus" \
  --planned "2h" \
  --actual "2h" \
  --done "Finished typical limit and integral problems" \
  --problem "Detail mistakes" \
  --next "Redo wrong problems"
```

Update dashboard focus or progress rows:

Windows PowerShell:

```powershell
.\scripts\study.ps1 dashboard `
  --today "Complete one framework verification task" `
  --progress "Demo route|In progress|Data split|Connect private data"
```

Linux/macOS:

```sh
sh scripts/study.sh dashboard \
  --today "Complete one framework verification task" \
  --progress "Demo route|In progress|Data split|Connect private data"
```

Create a weekly plan:

Windows PowerShell:

```powershell
.\scripts\study.ps1 week-plan `
  --week "2026-W26" `
  --theme "Framework verification" `
  --hours "3h"
```

Linux/macOS:

```sh
sh scripts/study.sh week-plan \
  --week "2026-W26" \
  --theme "Framework verification" \
  --hours "3h"
```

## Field Formats

- `--done` uses `Task|Result|Time|Evidence`
- `--problem` uses `Problem|Current judgment|Next step`
- `--progress` uses `Project|Status|Current stage|Next milestone`

Do not include `|` inside field values.
