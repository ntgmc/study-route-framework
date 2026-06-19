# Study Route Framework

[English](README.md) | [简体中文](README.zh-CN.md)

Study Route Framework 是一个本地优先的 Markdown 学习路线管理系统，用于管理学习路线、计划、日志、复盘、项目、记录、资源和考试笔记。

这个 public 仓库只保存可复用框架：

- Web GUI 和 API：`src/frontend/` 与 `src/backend/`
- CLI 辅助脚本：`src/cli/study.ts`
- 可复用 Markdown 模板：`templates/`
- public 示例数据：`demo-data/`
- 框架文档

个人学习内容不应放在这个 public 仓库中。推荐使用私有数据仓库 `my-study-route` 保存个人路线、笔记、日志和资料。

## 仓库拆分

| 仓库 | 职责 | 可见性 |
| --- | --- | --- |
| `study-route-framework` | 核心管理系统、UI、API、CLI、模板、文档、demo 数据 | public |
| `my-study-route` | 个人学习路线、笔记、进度日志、记录、资源 | private |

## 数据根目录

框架通过一个数据根目录读写 Markdown。

解析顺序：

1. 如果设置了 `STUDY_ROUTE_DATA_DIR`，使用该目录。
2. 如果没有设置，使用当前框架仓库里的 `demo-data/`。

因此，一个新的 public clone 可以直接用 demo 数据运行；个人数据则保留在私有仓库中。

Web GUI 会在侧栏显示当前数据模式、数据根目录和框架目录，便于编辑前确认资料实际写入位置。

每个数据目录的 AI 配置保存在 `.study-route/ai-config.json`。该文件只保存 provider、Base URL、模型、超时、token 上限、temperature、启用状态等非密钥字段。API Key 仍然只来自环境变量。

上传的图片、PDF 和其它附件会复制到当前数据根目录下的 `attachments/YYYY/MM/`。编辑器插入的 Markdown 使用这个相对路径，因此附件会跟随同一个学习工作区保存。

## 使用 Demo 数据快速启动

在框架仓库中运行：

Windows PowerShell：

```powershell
npm.cmd install
.\scripts\study-gui.ps1
```

Linux/macOS：

```sh
npm install
sh scripts/study-gui.sh
```

默认本地地址：

```text
http://127.0.0.1:8765
```

未配置外部数据根目录时，CLI 命令也会使用 `demo-data/`：

Windows PowerShell：

```powershell
.\scripts\study.ps1 init-log --date 2026-06-17
.\scripts\study.ps1 week-plan --week 2026-W26 --theme "Framework demo" --hours "3h"
```

Linux/macOS：

```sh
sh scripts/study.sh init-log --date 2026-06-17
sh scripts/study.sh week-plan --week 2026-W26 --theme "Framework demo" --hours "3h"
```

## 接入私有数据仓库

创建一个私有内容仓库，推荐结构如下：

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

然后把框架指向这个数据目录：

Windows PowerShell：

```powershell
$env:STUDY_ROUTE_DATA_DIR="D:\GITHOME\my-study-route"
D:\GITHOME\study-route-framework\scripts\study-gui.ps1
```

Linux/macOS：

```sh
export STUDY_ROUTE_DATA_DIR="$HOME/my-study-route"
sh /path/to/study-route-framework/scripts/study-gui.sh
```

CLI 使用同一个环境变量：

Windows PowerShell：

```powershell
$env:STUDY_ROUTE_DATA_DIR="D:\GITHOME\my-study-route"
D:\GITHOME\study-route-framework\scripts\study.ps1 init-log
```

Linux/macOS：

```sh
export STUDY_ROUTE_DATA_DIR="$HOME/my-study-route"
sh /path/to/study-route-framework/scripts/study.sh init-log
```

## 托管目录

GUI 和 CLI 会管理当前数据根目录下的这些 Markdown 位置：

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

API 只允许编辑 `dashboard.md` 以及托管 section 目录下的 Markdown 文件。备份和归档文件会写入当前数据根目录：

```text
.backups/study-gui/
.trash/study-gui/
```

## 数据导入与导出

数据模型是普通 Markdown 文件，加上 API 返回的 JSON。导入和导出可以通过复制目录、提交私有仓库，或使用 Web GUI/API 读写 Markdown 内容来完成。

## 编码与换行约定

本仓库所有文本文件统一保存为 UTF-8 无 BOM。`.editorconfig` 会约束常见源码和文档文件使用 CRLF，并约束 POSIX shell 脚本使用 LF；PowerShell 启动脚本会在启动 CLI 或 Web GUI 前设置 UTF-8 控制台输入输出。

如果在 Windows PowerShell 中看到中文输出乱码，请通过 `scripts/study.ps1` 或 `scripts/study-gui.ps1` 启动工具，以便应用 UTF-8 控制台设置。

推荐工作流：

- 在 `study-route-framework` 中维护框架代码。
- 在 `my-study-route` 中维护个人路线、笔记、记录、PDF 和进度数据。
- 不要把 `.env`、`private-data/`、`local-data/`、`.backups/`、`.trash/` 或个人 PDF 提交到 public 框架仓库。

## 可选 AI 生成

Web GUI 可以在配置环境变量后调用 OpenAI-compatible Chat Completions API。框架不会把 API Key 保存到项目目录、数据目录或浏览器存储中。AI 对话框会在生成前显示 provider、模型、目标 URL、当前文件路径、提示词字符数，以及是否会发送编辑器内容。

通用配置适用于任意兼容 API：

```powershell
$env:LLM_PROVIDER="custom"
$env:LLM_API_KEY="your-api-key"
$env:LLM_BASE_URL="https://api.example.com/v1"
$env:LLM_MODEL="model-name"
.\scripts\study-gui.ps1
```

Linux/macOS：

```sh
export LLM_PROVIDER="custom"
export LLM_API_KEY="your-api-key"
export LLM_BASE_URL="https://api.example.com/v1"
export LLM_MODEL="model-name"
sh scripts/study-gui.sh
```

也支持内置 provider 快捷配置：

- DeepSeek：`DEEPSEEK_API_KEY`，可选 `DEEPSEEK_BASE_URL`、`DEEPSEEK_MODEL`
- OpenAI：`OPENAI_API_KEY`，可选 `OPENAI_BASE_URL`、`OPENAI_MODEL`
- OpenRouter：`OPENROUTER_API_KEY`，可选 `OPENROUTER_BASE_URL`、`OPENROUTER_MODEL`
- 硅基流动：`SILICONFLOW_API_KEY`，可选 `SILICONFLOW_BASE_URL`、`SILICONFLOW_MODEL`
- Ollama：`LLM_PROVIDER=ollama`、`OLLAMA_MODEL`，可选 `OLLAMA_BASE_URL`，默认 `http://127.0.0.1:11434/v1`
- LM Studio：`LLM_PROVIDER=lmstudio`、`LMSTUDIO_MODEL`，可选 `LMSTUDIO_BASE_URL`，默认 `http://127.0.0.1:1234/v1`

本地模型示例：

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

如果需要完全关闭 AI，同时保留编辑器、搜索、保存等功能：

```powershell
$env:LLM_DISABLED="1"
.\scripts\study-gui.ps1
```

也可以从 Web GUI 侧栏打开 AI Provider 配置。通过 UI 保存的配置只作用于当前 `STUDY_ROUTE_DATA_DIR`，不会保存 API Key。

全局 `LLM_*` 变量优先级高于 provider 专用变量：

- `LLM_PROVIDER`，可选 `deepseek`、`openai`、`openrouter`、`siliconflow`、`custom`、`ollama`、`lmstudio`、`disabled`、`off`、`none`
- `LLM_API_KEY`
- `LLM_BASE_URL`
- `LLM_MODEL`
- `LLM_DISABLED`，设置为 `1`、`true`、`yes` 或 `on` 时禁止 AI 请求
- `LLM_TIMEOUT`，默认 `60`
- `LLM_MAX_TOKENS`，默认 `1800`
- `LLM_TEMPERATURE`，默认 `0.4`

更多命令细节见 `scripts/README.md`。
