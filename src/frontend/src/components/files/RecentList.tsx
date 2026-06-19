import type { FileMeta } from "../../../../../types/domain";
import { useAppStore } from "../../store";

export function RecentList({ files, onOpen }: { files: FileMeta[]; onOpen: (file: FileMeta) => Promise<void> }) {
  const setStatus = useAppStore((state) => state.setStatus);
  if (!files.length) return <div className="p-6 text-center text-sm text-muted">没有结果</div>;
  return (
    <div className="grid gap-2 p-3">
      {files.map((file) => (
        <button key={`${file.path}-${file.line ?? ""}`} type="button" onClick={() => onOpen(file).catch((error: Error) => setStatus(error.message, true))} className="rounded-lg border border-line bg-white p-3 text-left hover:border-brand hover:shadow-[0_0_0_3px_rgba(15,118,110,.18)]">
          <div className="font-semibold [overflow-wrap:anywhere]">{file.title}</div>
          <div className="text-xs text-muted [overflow-wrap:anywhere]">
            {file.path} · {file.updated}{file.line ? ` · 第 ${file.line} 行` : ""}
          </div>
          <div className="text-xs text-muted [overflow-wrap:anywhere]">{file.snippet || file.excerpt}</div>
        </button>
      ))}
    </div>
  );
}
