import { Check, History, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type {
  AiActionId,
  AiApplyMode,
  AiGenerateResponse,
  AiHistoryResponse,
  AiSelectionRange,
  AiStatusResponse
} from "../../../types/api";
import type { FileMeta, SectionKey } from "../../../types/domain";
import { client } from "./api";
import { useAppStore } from "./store";
import { Button, DialogShell } from "./ui";

function formatCount(value: number): string {
  return `${value.toLocaleString()} 字符`;
}

function statusText(info: AiStatusResponse | null, fallback: string): string {
  if (!info) return fallback;
  if (!info.enabled) return `AI 已关闭：${info.disabled_reason ?? "当前工作区不会发送 AI 请求"}`;
  if (!info.configured) return `未配置：${info.required_env}`;
  return `${info.provider} · ${info.model}${info.local_provider ? " · 本地模型" : ""}`;
}

function diffRows(preview: string): Array<{ kind: "same" | "add" | "remove"; text: string }> {
  return preview.split(/\r?\n/).filter(Boolean).map((line) => {
    if (line.startsWith("+")) return { kind: "add", text: line.slice(1) };
    if (line.startsWith("-")) return { kind: "remove", text: line.slice(1) };
    return { kind: "same", text: line.slice(1) || line };
  });
}

function actionMode(actionId: AiActionId): string {
  if (actionId === "route_to_next_week_plan") return "plan";
  if (actionId === "inbox_to_log") return "log";
  if (actionId === "logs_to_weekly_review") return "review";
  if (actionId === "current_file_to_tasks") return "tasks";
  return "doc";
}

export interface AiApplyPayload {
  content: string;
  operationId: string;
  applyMode: AiApplyMode;
  selection?: AiSelectionRange;
}

export function AiDialog({
  section,
  current,
  content,
  selection,
  onClose,
  onApply,
  onOpenSettings
}: {
  section: SectionKey;
  current: FileMeta | null;
  content: string;
  selection?: AiSelectionRange;
  onClose: () => void;
  onApply: (payload: AiApplyPayload) => void;
  onOpenSettings?: () => void;
}) {
  const setStatus = useAppStore((state) => state.setStatus);
  const [aiInfo, setAiInfo] = useState<AiStatusResponse | null>(null);
  const [status, setAiStatus] = useState("检测中");
  const [actionId, setActionId] = useState<AiActionId>(selection?.text ? "task_acceptance_criteria" : "current_file_to_tasks");
  const [templateId, setTemplateId] = useState("");
  const [prompt, setPrompt] = useState("");
  const [scope, setScope] = useState<"file" | "selection">(selection?.text ? "selection" : "file");
  const [applyMode, setApplyMode] = useState<AiApplyMode>(selection?.text ? "selection" : "append");
  const [useContext, setUseContext] = useState(true);
  const [result, setResult] = useState<AiGenerateResponse | null>(null);
  const [history, setHistory] = useState<AiHistoryResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);

  useEffect(() => {
    client
      .aiStatus()
      .then((info) => {
        setAiInfo(info);
        setAiStatus(statusText(info, ""));
      })
      .catch((error: Error) => setAiStatus(error.message));
    client.aiHistory(12).then(setHistory).catch(() => undefined);
  }, []);

  useEffect(() => {
    if (scope === "selection") setApplyMode("selection");
  }, [scope]);

  const canGenerate = Boolean(aiInfo?.enabled && aiInfo.configured && !busy);
  const templates = useMemo(
    () => (aiInfo?.settings.promptTemplates ?? []).filter((item) => item.enabled && item.actionId === actionId),
    [actionId, aiInfo?.settings.promptTemplates]
  );
  const selectedTemplate = templates.find((item) => item.id === templateId);
  const contextLimit = aiInfo?.context_limits.context_chars ?? 12000;
  const promptLimit = aiInfo?.context_limits.prompt_chars ?? 4000;
  const selectedText = selection?.text ?? "";
  const contextText = useContext ? (scope === "selection" ? selectedText : content) : "";
  const contextChars = Math.min(contextText.trim().length, contextLimit);
  const promptChars = Math.min(prompt.trim().length, promptLimit);
  const workspacePrompt = aiInfo?.settings.workspacePrompt ?? "";
  const action = aiInfo?.actions.find((item) => item.id === actionId);
  const sendSummary = useMemo(
    () => [
      ["Provider", aiInfo ? `${aiInfo.provider}${aiInfo.local_provider ? "（本地）" : ""}` : "检测中"],
      ["Base URL", aiInfo?.base_url || "未配置"],
      ["Model", aiInfo?.model || "未配置"],
      ["AI 动作", action?.label ?? actionId],
      ["Prompt 模板", selectedTemplate ? selectedTemplate.name : "未使用"],
      ["工作区约束", workspacePrompt ? `${formatCount(workspacePrompt.length)}，会发送` : "未设置"],
      ["当前分类", section],
      ["当前文件", current?.path || "未选择"],
      ["作用范围", scope === "selection" ? `当前选区 ${selection?.startLine}:${selection?.startColumn} - ${selection?.endLine}:${selection?.endColumn}` : "当前文件全文"],
      ["生成要求", `${formatCount(promptChars)} / 上限 ${formatCount(promptLimit)}`],
      ["上下文", useContext ? `会发送 ${formatCount(contextChars)} / 上限 ${formatCount(contextLimit)}` : "不会发送"]
    ],
    [action?.label, actionId, aiInfo, contextChars, contextLimit, current?.path, promptChars, promptLimit, scope, section, selectedTemplate, selection, useContext, workspacePrompt]
  );

  async function generate() {
    setBusy(true);
    try {
      const response = await client.aiGenerate({
        mode: actionMode(actionId),
        actionId,
        templateId: templateId || undefined,
        workspacePrompt,
        prompt,
        section,
        path: current?.path || "",
        context: useContext && scope === "file" ? content : "",
        selection: useContext && scope === "selection" ? selection : undefined,
        applyMode
      });
      setResult(response);
      setStatus(`${response.provider} 生成完成：${response.model}`);
      const nextHistory = await client.aiHistory(12).catch(() => null);
      if (nextHistory) setHistory(nextHistory);
    } finally {
      setBusy(false);
    }
  }

  async function applyResult() {
    if (!result) return;
    await client.markAiApplied(result.operation_id);
    onApply({
      content: result.content,
      operationId: result.operation_id,
      applyMode,
      selection: scope === "selection" ? selection : undefined
    });
  }

  return (
    <DialogShell title="AI 工作流" onClose={onClose}>
      <form
        className="grid gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          generate().catch((error: Error) => setStatus(error.message, true));
        }}
      >
        <div
          className={`w-fit rounded-full px-3 py-1 text-xs ${
            aiInfo?.enabled === false
              ? "bg-slate-200 text-slate-700"
              : aiInfo?.configured
                ? "bg-green-100 text-green-800"
                : "bg-amber-100 text-amber-800"
          }`}
        >
          {status}
        </div>

        <section className="grid gap-3 rounded-md border border-line bg-white p-3">
          <div className="text-sm font-medium text-ink">动作与模板</div>
          <div className="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
            <label className="grid gap-1 text-sm text-muted">
              AI 动作
              <select className="min-h-10 rounded-md border border-line px-3 text-ink" value={actionId} onChange={(event) => { setActionId(event.target.value as AiActionId); setTemplateId(""); }}>
                {(aiInfo?.actions ?? []).map((item) => (
                  <option key={item.id} value={item.id}>{item.label}</option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-sm text-muted">
              Prompt 模板
              <select className="min-h-10 rounded-md border border-line px-3 text-ink" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
                <option value="">不使用模板</option>
                {templates.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
            <label className="grid gap-1 text-sm text-muted">
              作用范围
              <select className="min-h-10 rounded-md border border-line px-3 text-ink" value={scope} onChange={(event) => setScope(event.target.value as "file" | "selection")}>
                <option value="file">当前文件全文</option>
                <option value="selection" disabled={!selection?.text}>当前选区</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm text-muted">
              采纳方式
              <select className="min-h-10 rounded-md border border-line px-3 text-ink" value={applyMode} disabled={scope === "selection"} onChange={(event) => setApplyMode(event.target.value as AiApplyMode)}>
                <option value="append">追加到当前文件</option>
                <option value="replace">替换当前文件</option>
                <option value="selection">替换当前选区</option>
              </select>
            </label>
          </div>
        </section>

        <label className="grid gap-1 text-sm text-muted">
          生成要求
          <textarea className="min-h-24 rounded-md border border-line p-3 text-ink" value={prompt} maxLength={promptLimit} onChange={(event) => setPrompt(event.target.value)} />
        </label>

        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={useContext} onChange={(event) => setUseContext(event.target.checked)} />
          发送所选范围作为上下文
        </label>

        <section className="rounded-md border border-line bg-slate-50 p-3">
          <div className="mb-2 text-sm font-medium text-ink">本次会发送</div>
          <dl className="grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
            {sendSummary.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted">{label}</dt>
                <dd className="min-w-0 break-words text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        {result ? (
          <section className="grid gap-3 rounded-md border border-line bg-white p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-ink">Diff 审阅</div>
                <div className="text-xs text-muted">operation: {result.operation_id}</div>
              </div>
              <div className="text-xs text-muted">+{result.diff.added} -{result.diff.removed}</div>
            </div>
            <div className="max-h-52 overflow-auto rounded-md border border-line bg-slate-950 p-2 font-mono text-xs">
              {diffRows(result.diff.preview).map((row, index) => (
                <div key={index} className={row.kind === "add" ? "text-green-300" : row.kind === "remove" ? "text-red-300" : "text-slate-300"}>
                  {row.kind === "add" ? "+" : row.kind === "remove" ? "-" : " "}{row.text || " "}
                </div>
              ))}
            </div>
            <label className="grid gap-1 text-sm text-muted">
              生成结果
              <textarea className="min-h-44 rounded-md border border-line p-3 font-mono text-sm text-ink" value={result.content} readOnly />
            </label>
            <div className="flex flex-wrap gap-2 text-xs">
              {result.sources.map((source) => (
                <span key={`${source.kind}-${source.label}`} className="rounded-full bg-slate-100 px-2 py-1 text-slate-700">
                  {source.label} · {source.kind} · {formatCount(source.chars)}
                </span>
              ))}
            </div>
          </section>
        ) : null}

        {historyOpen ? (
          <section className="grid gap-2 rounded-md border border-line bg-slate-50 p-3">
            <div className="text-sm font-medium text-ink">AI 操作历史</div>
            {(history?.operations ?? []).length ? history!.operations.map((item) => (
              <div key={item.id} className="rounded-md border border-line bg-white p-2 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium text-ink">{item.action_label}</span>
                  <span className="text-muted">{item.status} · {item.provider} · {item.model}</span>
                </div>
                <div className="mt-1 break-words text-muted">{item.path || "未选择文件"} · +{item.diff.added} -{item.diff.removed}{item.backup ? ` · 备份 ${item.backup}` : ""}</div>
              </div>
            )) : <div className="text-sm text-muted">暂无 AI 操作历史。</div>}
          </section>
        ) : null}

        <div className="flex flex-wrap justify-end gap-2">
          {onOpenSettings ? <Button type="button" onClick={onOpenSettings}>配置</Button> : null}
          <Button type="button" onClick={() => setHistoryOpen((value) => !value)}>
            <History className="h-4 w-4" />
            历史
          </Button>
          <Button type="button" onClick={onClose}>关闭</Button>
          <Button type="submit" variant="primary" disabled={!canGenerate || !prompt.trim()}>
            <Sparkles className="h-4 w-4" />
            {busy ? "生成中" : "生成草案"}
          </Button>
          <Button type="button" disabled={!result} onClick={() => applyResult().catch((error: Error) => setStatus(error.message, true))}>
            <Check className="h-4 w-4" />
            采纳到编辑器
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}

export default AiDialog;
