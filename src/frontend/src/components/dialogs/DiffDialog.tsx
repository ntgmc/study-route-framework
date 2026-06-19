import { useMemo } from "react";
import { Download } from "lucide-react";
import type { DraftVersionRecord } from "../../drafts";
import { buildLineDiff, formatVersionTime } from "../../domain/uiState";
import { Button, DialogShell } from "../../ui";

export function DiffDialog({
  version,
  currentContent,
  onClose,
  onRestore,
  onExport
}: {
  version: DraftVersionRecord;
  currentContent: string;
  onClose: () => void;
  onRestore: () => void;
  onExport: () => void;
}) {
  const rows = useMemo(() => buildLineDiff(version.content, currentContent), [currentContent, version.content]);
  return (
    <DialogShell title={`版本对比 · ${formatVersionTime(version.updatedAt)}`} onClose={onClose}>
      <div className="mb-3 flex flex-wrap justify-end gap-2">
        <Button type="button" onClick={onExport}>
          <Download className="h-4 w-4" />
          导出草稿
        </Button>
        <Button type="button" variant="primary" onClick={onRestore}>
          恢复草稿
        </Button>
      </div>
      <div className="max-h-[62vh] overflow-auto rounded-md border border-line bg-slate-950 font-mono text-xs leading-6 text-slate-100">
        {rows.map((row, index) => (
          <div
            key={`${row.kind}-${row.line}-${index}`}
            className={`grid grid-cols-[56px_28px_minmax(0,1fr)] px-2 ${
              row.kind === "add" ? "bg-green-950/60" : row.kind === "remove" ? "bg-red-950/60" : ""
            }`}
          >
            <span className="select-none text-slate-400">{row.line}</span>
            <span className={row.kind === "add" ? "text-green-300" : row.kind === "remove" ? "text-red-300" : "text-slate-500"}>
              {row.kind === "add" ? "+" : row.kind === "remove" ? "-" : " "}
            </span>
            <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">{row.text || " "}</span>
          </div>
        ))}
      </div>
    </DialogShell>
  );
}
