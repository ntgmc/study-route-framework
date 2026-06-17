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

## 使用 Demo 数据快速启动

在框架仓库中运行：

```powershell
.\scripts\study-gui.ps1
```

默认本地地址：

```text
http://127.0.0.1:8765
```

未配置外部数据根目录时，CLI 命令也会使用 `demo-data/`：

```powershell
.\scripts\study.ps1 init-log --date 2026-06-17
.\scripts\study.ps1 week-plan --week 2026-W26 --theme "Framework demo" --hours "3h"
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

```powershell
$env:STUDY_ROUTE_DATA_DIR="D:\GITHOME\my-study-route"
D:\GITHOME\study-route-framework\scripts\study-gui.ps1
```

CLI 使用同一个环境变量：

```powershell
$env:STUDY_ROUTE_DATA_DIR="D:\GITHOME\my-study-route"
D:\GITHOME\study-route-framework\scripts\study.ps1 init-log
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

本仓库所有文本文件统一保存为 UTF-8 无 BOM，并统一使用 CRLF 换行。`.editorconfig` 会约束常见源码和文档文件使用 UTF-8 与 CRLF；PowerShell 启动脚本会在启动 CLI 或 Web GUI 前设置 UTF-8 控制台输入输出。

如果在 Windows PowerShell 中看到中文输出乱码，请通过 `scripts/study.ps1` 或 `scripts/study-gui.ps1` 启动工具，以便应用 UTF-8 控制台设置。

推荐工作流：

- 在 `study-route-framework` 中维护框架代码。
- 在 `my-study-route` 中维护个人路线、笔记、记录、PDF 和进度数据。
- 不要把 `.env`、`private-data/`、`local-data/`、`.backups/`、`.trash/` 或个人 PDF 提交到 public 框架仓库。

## 可选 AI 生成

Web GUI 可以在配置环境变量后调用 DeepSeek。框架不会保存 API Key。

```powershell
$env:DEEPSEEK_API_KEY="your-api-key"
.\scripts\study-gui.ps1
```

可选变量：

- `DEEPSEEK_MODEL`，默认 `deepseek-v4-flash`
- `DEEPSEEK_BASE_URL`，默认 `https://api.deepseek.com`
- `DEEPSEEK_MAX_TOKENS`，默认 `1800`
- `DEEPSEEK_TEMPERATURE`，默认 `0.4`

更多命令细节见 `scripts/README.md`。
