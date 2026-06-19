import { Bot, FilePlus2, Search } from "lucide-react";
import type { FileMeta, SectionSummary } from "../../../../../types/domain";
import type { ViewMode } from "../../store";
import { Button } from "../../ui";

interface AppHeaderProps {
  view: ViewMode;
  activeInfo?: SectionSummary;
  searchResults: FileMeta[];
  source: string;
  runSearch: (text: string) => Promise<void>;
  setStatus: (message: string, isError?: boolean) => void;
  onOpenAi: () => void;
  onCreate: () => void;
}

export function AppHeader({ view, activeInfo, searchResults, source, runSearch, setStatus, onOpenAi, onCreate }: AppHeaderProps) {
  return (
        <header className="flex min-h-[74px] items-center justify-between gap-4 border-b border-line bg-white px-6 py-3 max-[920px]:items-stretch max-[920px]:flex-col">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold">{view === "search" ? "全局搜索" : activeInfo?.label || "总览"}</h2>
            <p className="truncate text-xs text-muted">
              {view === "search" ? `${searchResults.length} 个结果` : activeInfo ? `${activeInfo.count} 个文件 · ${source}` : "加载中"}
            </p>
          </div>
          <div className="flex items-center gap-2 max-[920px]:flex-col max-[920px]:items-stretch">
            <label className="relative">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted" />
              <input
                className="min-h-10 rounded-md border border-line pl-9 pr-3 text-sm outline-brand"
                type="search"
                placeholder="全局搜索"
                onKeyDown={(event) => {
                  if (event.key === "Enter") runSearch(event.currentTarget.value).catch((error: Error) => setStatus(error.message, true));
                }}
              />
            </label>
            <Button data-testid="ai-open-button" onClick={onOpenAi}>
              <Bot className="h-4 w-4" />
              AI 生成
            </Button>
            <Button variant="primary" onClick={onCreate}>
              <FilePlus2 className="h-4 w-4" />
              新建
            </Button>
          </div>
        </header>


  );
}
