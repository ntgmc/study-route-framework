import { Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AiStatusResponse } from "../../../types/api";
import type { FileMeta, SectionKey } from "../../../types/domain";
import { client } from "./api";
import { useAppStore } from "./store";
import { Button, DialogShell } from "./ui";

function formatCount(value: number): string {
  return `${value.toLocaleString()} 字符`;
}

function statusText(info: AiStatusResponse | null, fallback: string): string {
  if (!info) return fallback;
  if (!info.enabled) return `AI 已关闭：${info.disabled_reason ?? "当前工作区不发送 AI 请求"}`;
  if (!info.configured) return `未配置：${info.required_env}`;
  return `${info.provider} · ${info.model}${info.local_provider ? " · 本地模型" : ""}`;
}

export function AiDialog({
  section,
  current,
  content,
  onClose,
  onApply,
  onConfirmReplace,
  onOpenSettings
}: {
  section: SectionKey;
  current: FileMeta | null;
  content: string;
  onClose: () => void;
  onApply: (content: string, replace: boolean) => void;
  onConfirmReplace: () => Promise<boolean>;
  onOpenSettings?: () => void;
}) {
  const setStatus = useAppStore((state) => state.setStatus);
  const [aiInfo, setAiInfo] = useState<AiStatusResponse | null>(null);
  const [status, setAiStatus] = useState("检测中");
  const [mode, setMode] = useState("doc");
  const [prompt, setPrompt] = useState("");
  const [useContext, setUseContext] = useState(true);
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    client
      .aiStatus()
      .then((info) => {
        setAiInfo(info);
        setAiStatus(statusText(info, ""));
      })
      .catch((error: Error) => setAiStatus(error.message));
  }, []);

  const canGenerate = Boolean(aiInfo?.enabled && aiInfo.configured && !busy);
  const contextLimit = aiInfo?.context_limits.context_chars ?? 12000;
  const promptLimit = aiInfo?.context_limits.prompt_chars ?? 4000;
  const contextChars = useContext ? Math.min(content.trim().length, contextLimit) : 0;
  const promptChars = Math.min(prompt.trim().length, promptLimit);
  const sendSummary = useMemo(
    () => [
      ["Provider", aiInfo ? `${aiInfo.provider}${aiInfo.local_provider ? "（本地）" : ""}` : "检测中"],
      ["Base URL", aiInfo?.base_url || "未配置"],
      ["Model", aiInfo?.model || "未配置"],
      ["生成类型", mode],
      ["当前分类", section],
      ["当前文件", current?.path || "未选择"],
      ["生成要求", `${formatCount(promptChars)} / 上限 ${formatCount(promptLimit)}`],
      ["编辑器上下文", useContext ? `会发送 ${formatCount(contextChars)} / 上限 ${formatCount(contextLimit)}` : "不会发送"]
    ],
    [aiInfo, contextChars, contextLimit, current?.path, mode, promptChars, promptLimit, section, useContext]
  );

  async function generate() {
    setBusy(true);
    try {
      const response = await client.aiGenerate({
        mode,
        prompt,
        section,
        path: current?.path || "",
        context: useContext ? content : ""
      });
      setResult(response.content);
      setStatus(`${response.provider} 生成完成：${response.model}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogShell title="AI 生成" onClose={onClose}>
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

        <label className="grid gap-1 text-sm text-muted">
          生成类型
          <select className="min-h-10 rounded-md border border-line px-3 text-ink" value={mode} onChange={(event) => setMode(event.target.value)}>
            <option value="doc">完整文档</option>
            <option value="plan">学习计划</option>
            <option value="log">学习日志</option>
            <option value="review">复盘总结</option>
            <option value="tasks">任务拆解</option>
            <option value="polish">润色当前文档</option>
          </select>
        </label>

        <label className="grid gap-1 text-sm text-muted">
          生成要求
          <textarea className="min-h-28 rounded-md border border-line p-3 text-ink" value={prompt} onChange={(event) => setPrompt(event.target.value)} />
        </label>

        <label className="flex items-center gap-2 text-sm text-muted">
          <input type="checkbox" checked={useContext} onChange={(event) => setUseContext(event.target.checked)} />
          带入当前编辑器内容作为上下文
        </label>

        <section className="rounded-md border border-line bg-slate-50 p-3">
          <div className="mb-2 text-sm font-medium text-ink">本次会发送</div>
          <dl className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
            {sendSummary.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-muted">{label}</dt>
                <dd className="min-w-0 break-words text-ink">{value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <label className="grid gap-1 text-sm text-muted">
          生成结果
          <textarea className="min-h-48 rounded-md border border-line p-3 font-mono text-sm text-ink" value={result} onChange={(event) => setResult(event.target.value)} />
        </label>

        <div className="flex flex-wrap justify-end gap-2">
          {onOpenSettings ? (
            <Button type="button" onClick={onOpenSettings}>
              配置
            </Button>
          ) : null}
          <Button type="button" onClick={onClose}>
            关闭
          </Button>
          <Button type="submit" variant="primary" disabled={!canGenerate}>
            <Sparkles className="h-4 w-4" />
            {busy ? "生成中" : "生成"}
          </Button>
          <Button type="button" disabled={!result} onClick={() => onApply(result, false)}>
            插入编辑器
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={!result}
            onClick={() => {
              onConfirmReplace()
                .then((confirmed) => {
                  if (confirmed) onApply(result, true);
                })
                .catch((error: Error) => setStatus(error.message, true));
            }}
          >
            替换编辑器
          </Button>
        </div>
      </form>
    </DialogShell>
  );
}

export default AiDialog;
