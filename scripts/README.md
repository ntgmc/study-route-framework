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

Then run GUI or CLI commands from the public framework repository:

```powershell
.\scripts\study-gui.ps1
.\scripts\study.ps1 init-log
```

Unset the variable to return to public demo data:

```powershell
Remove-Item Env:\STUDY_ROUTE_DATA_DIR
```

## Web GUI

Start the local Web GUI:

```powershell
.\scripts\study-gui.ps1
```

Default address:

```text
http://127.0.0.1:8765
```

Common parameters:

```powershell
.\scripts\study-gui.ps1 --port 8787
.\scripts\study-gui.ps1 --host 127.0.0.1 --port 8765
```

The GUI supports:

- browsing managed sections under the active data root
- editing and saving Markdown files
- creating, renaming, and archiving Markdown files
- switching between editor and preview
- full-text search
- updating `dashboard.md` focus fields
- appending daily logs
- optional DeepSeek-assisted Markdown generation

Before saving an existing file, the GUI writes a backup under:

```text
.backups/study-gui/
```

Archived files are moved under:

```text
.trash/study-gui/
```

Both paths are relative to the active data root.

## DeepSeek Generation

The GUI does not store API keys. Set the API key in the terminal before startup:

```powershell
$env:DEEPSEEK_API_KEY="your-api-key"
.\scripts\study-gui.ps1
```

Optional variables:

```powershell
$env:DEEPSEEK_MODEL="deepseek-v4-flash"
$env:DEEPSEEK_BASE_URL="https://api.deepseek.com"
$env:DEEPSEEK_MAX_TOKENS="1800"
$env:DEEPSEEK_TEMPERATURE="0.4"
```

## CLI Commands

Create today's learning log:

```powershell
.\scripts\study.ps1 init-log
```

Append completed items, takeaways, and next steps:

```powershell
.\scripts\study.ps1 add-log `
  --done "Task|Result|1h|records/example.md" `
  --takeaway "Key takeaway" `
  --next "Next action"
```

Append a LeetCode record:

```powershell
.\scripts\study.ps1 leetcode `
  --topic "Linked list" `
  --title "Reverse Linked List" `
  --difficulty "Easy" `
  --result "Solved independently" `
  --redo "Yes" `
  --note "Review iterative and recursive forms"
```

Append an exam review record:

```powershell
.\scripts\study.ps1 exam-review `
  --subject "Calculus" `
  --planned "2h" `
  --actual "2h" `
  --done "Finished typical limit and integral problems" `
  --problem "Detail mistakes" `
  --next "Redo wrong problems"
```

Update dashboard focus or progress rows:

```powershell
.\scripts\study.ps1 dashboard `
  --today "Complete one framework verification task" `
  --progress "Demo route|In progress|Data split|Connect private data"
```

Create a weekly plan:

```powershell
.\scripts\study.ps1 week-plan `
  --week "2026-W26" `
  --theme "Framework verification" `
  --hours "3h"
```

## Field Formats

- `--done` uses `Task|Result|Time|Evidence`
- `--problem` uses `Problem|Current judgment|Next step`
- `--progress` uses `Project|Status|Current stage|Next milestone`

Do not include `|` inside field values.
