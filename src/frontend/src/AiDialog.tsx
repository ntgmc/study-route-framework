import { Sparkles } from "lucide-react";
import { useEffect, useState } from "react";
import type { FileMeta, SectionKey } from "../../../types/domain";
import { client } from "./api";
import { Button, DialogShell } from "./ui";
import { useAppStore } from "./store";

export function AiDialog({
  section,
  current,
  content,
  onClose,
  onApply,
  onConfirmReplace
}: {
  section: SectionKey;
  current: FileMeta | null;
  content: string;
  onClose: () => void;
  onApply: (content: string, replace: boolean) => void;
  onConfirmReplace: () => Promise<boolean>;
}) {
  const setStatus = useAppStore((state) => state.setStatus);
  const [status, setAiStatus] = useState("检测中");
  const [configured, setConfigured] = useState(false);
  const [mode, setMode] = useState("doc");
  const [prompt, setPrompt] = useState("");
  const [useContext, setUseContext] = useState(true);
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    client
      .aiStatus()
      .then((info) => {
        setConfigured(info.configured);
        setAiStatus(info.configured ? `${info.provider} · ${info.model} 已配置` : `未配置 ${info.required_env}`);
      })
      .catch((error: Error) => setAiStatus(error.message));
  }, []);

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
        <div className={`w-fit rounded-full px-3 py-1 text-xs ${configured ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>{status}</div>
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
        <label className="grid gap-1 text-sm text-muted">
          生成结果
          <textarea className="min-h-48 rounded-md border border-line p-3 font-mono text-sm text-ink" value={result} onChange={(event) => setResult(event.target.value)} />
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" onClick={onClose}>
            关闭
          </Button>
          <Button type="submit" variant="primary" disabled={!configured || busy}>
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
