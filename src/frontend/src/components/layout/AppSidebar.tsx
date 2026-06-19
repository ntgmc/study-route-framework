import { Folder, GitCompare, Save, Settings } from "lucide-react";
import type { GitStatusResponse } from "../../../../../types/api";
import type { RepoSummary, SectionKey } from "../../../../../types/domain";
import type { ViewMode } from "../../store";
import { Button } from "../../ui";

interface AppSidebarProps {
  summary: RepoSummary | null;
  section: SectionKey;
  view: ViewMode;
  source: string;
  isDemoData: boolean;
  gitStatus: GitStatusResponse | null;
  gitBusy: boolean;
  selectSection: (section: SectionKey) => Promise<void>;
  setStatus: (message: string, isError?: boolean) => void;
  setAiSettingsOpen: (open: boolean) => void;
  refreshGitStatus: () => Promise<void>;
  commitSnapshot: () => Promise<void>;
}

export function AppSidebar({
  summary,
  section,
  view,
  source,
  isDemoData,
  gitStatus,
  gitBusy,
  selectSection,
  setStatus,
  setAiSettingsOpen,
  refreshGitStatus,
  commitSnapshot
}: AppSidebarProps) {
  return (
      <aside className="overflow-auto bg-slate-900 p-4 text-slate-100">
        <div className="mb-4 flex items-center gap-3 border-b border-white/10 px-2 pb-4">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-brand font-bold">SR</div>
          <div>
            <h1 className="text-lg font-semibold">Study Route</h1>
            <p className="text-xs text-slate-300">本地学习路线管理</p>
          </div>
        </div>
        <nav className="grid gap-1 max-[920px]:grid-cols-[repeat(auto-fit,minmax(96px,1fr))]">
          {summary?.sections.map((item) => (
            <button
              key={item.key}
              type="button"
              data-testid={`section-${item.key}`}
              onClick={() => selectSection(item.key).catch((error: Error) => setStatus(error.message, true))}
              className={`flex min-h-10 items-center justify-between rounded-md px-3 text-left text-sm hover:bg-slate-800 ${section === item.key && view !== "search" ? "bg-slate-800" : ""}`}
            >
              <span>{item.label}</span>
              <span className="rounded-full bg-white/10 px-2 text-xs text-slate-300">{item.count}</span>
            </button>
          ))}
        </nav>
        {summary ? (
          <section className="mt-4 rounded-md border border-white/10 bg-white/5 p-3 text-xs">
            <div className="mb-2 flex items-center justify-between gap-2 font-medium text-slate-100">
              <span className="flex items-center gap-2">
                <Folder className="h-4 w-4" />
                当前数据目录
              </span>
              <button type="button" className="grid h-7 w-7 place-items-center rounded-md bg-white/10 hover:bg-white/15" title="AI 配置" onClick={() => setAiSettingsOpen(true)}>
                <Settings className="h-4 w-4" />
              </button>
            </div>
            <div className="grid gap-2 text-slate-300">
              <div>
                <div className="text-slate-400">数据模式</div>
                <div className={isDemoData ? "font-medium text-amber-200" : "font-medium text-emerald-200"}>{source}</div>
              </div>
              <div>
                <div className="text-slate-400">资料写入位置</div>
                <div className="break-words font-mono text-[11px] leading-5 text-slate-100">{summary.dataRoot}</div>
              </div>
              <div>
                <div className="text-slate-400">框架目录</div>
                <div className="break-words font-mono text-[11px] leading-5">{summary.frameworkRoot}</div>
              </div>
              {isDemoData ? <div className="rounded-md bg-amber-400/10 p-2 text-amber-100">当前使用 Demo 数据，仅适合示例体验；长期使用请设置 STUDY_ROUTE_DATA_DIR。</div> : null}
            </div>
          </section>
        ) : null}
        {gitStatus ? (
          <section className="mt-3 grid gap-2 rounded-md border border-white/10 bg-white/5 p-3 text-xs">
            <div className="flex items-center justify-between gap-2 font-medium text-slate-100">
              <span className="flex items-center gap-2">
                <GitCompare className="h-4 w-4" />
                Git
              </span>
              <button type="button" className="rounded-md bg-white/10 px-2 py-1 text-[11px] hover:bg-white/15" onClick={() => refreshGitStatus().catch((error: Error) => setStatus(error.message, true))}>
                刷新
              </button>
            </div>
            <div className="grid gap-1 text-slate-300">
              <div className={gitStatus.isRepo ? gitStatus.clean ? "text-emerald-200" : gitStatus.conflicts.length ? "text-red-200" : "text-amber-200" : "text-slate-300"}>
                {!gitStatus.isRepo ? "不是 Git 仓库" : gitStatus.clean ? "工作区干净" : gitStatus.conflicts.length ? `${gitStatus.conflicts.length} 个冲突` : `${gitStatus.files.length} 个改动`}
              </div>
              {gitStatus.branch ? <div className="font-mono text-[11px] text-slate-400">{gitStatus.branch}</div> : null}
              {gitStatus.message ? <div className="text-slate-400 [overflow-wrap:anywhere]">{gitStatus.message}</div> : null}
            </div>
            <Button
              type="button"
              disabled={gitBusy || !gitStatus.isRepo || gitStatus.clean || gitStatus.conflicts.length > 0}
              onClick={() => commitSnapshot().catch((error: Error) => setStatus(error.message, true))}
            >
              <Save className="h-4 w-4" />
              {gitBusy ? "提交中" : "提交学习快照"}
            </Button>
          </section>
        ) : null}
      </aside>


  );
}
