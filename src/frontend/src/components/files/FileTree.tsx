import { Folder, Pin, Star } from "lucide-react";
import type { FileMeta } from "../../../../../types/domain";
import { useAppStore } from "../../store";

export function FileTree({
  files,
  current,
  onOpen
}: {
  files: FileMeta[];
  current: FileMeta | null;
  onOpen: (path: string) => Promise<void>;
}) {
  const setStatus = useAppStore((state) => state.setStatus);
  if (!files.length) return <div className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">当前分类没有 Markdown 文件</div>;
  const groups = files.reduce<Record<string, FileMeta[]>>((result, file) => {
    const parts = file.path.split("/");
    const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "根目录";
    result[folder] = [...(result[folder] ?? []), file];
    return result;
  }, {});
  return (
    <div className="grid gap-3">
      {Object.entries(groups).map(([folder, items]) => (
        <div key={folder} className="grid gap-1">
          <div className="flex items-center gap-2 px-1 text-xs font-semibold text-muted">
            <Folder className="h-3.5 w-3.5" />
            <span className="truncate">{folder}</span>
          </div>
          <div className="grid gap-1">
            {items.map((file) => {
              return (
                <button
                  key={file.path}
                  type="button"
                  data-testid={`file-item-${file.path}`}
                  onClick={() => onOpen(file.path).catch((error: Error) => setStatus(error.message, true))}
                  className={`min-h-[76px] rounded-md border bg-white p-3 text-left hover:border-brand hover:shadow-[0_0_0_3px_rgba(15,118,110,.18)] ${
                    current?.path === file.path ? "border-brand shadow-[0_0_0_3px_rgba(15,118,110,.18)]" : "border-line"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold [overflow-wrap:anywhere]">{file.title}</div>
                      <div className="text-xs text-muted [overflow-wrap:anywhere]">{file.name} · {file.updated} · {file.size} B</div>
                    </div>
                    <div className="flex shrink-0 gap-1 text-muted">
                      {file.pinned ? <Pin className="h-3.5 w-3.5 fill-current" /> : null}
                      {file.favorite ? <Star className="h-3.5 w-3.5 fill-current" /> : null}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-muted [overflow-wrap:anywhere]">{file.excerpt}</div>
                  {file.tags.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {file.tags.map((tag) => (
                        <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
