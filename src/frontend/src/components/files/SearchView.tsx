import type { FileMeta } from "../../../../../types/domain";
import { Panel } from "../common";
import { RecentList } from "./RecentList";

export function SearchView({ results, onOpen }: { results: FileMeta[]; onOpen: (file: FileMeta) => Promise<void> }) {
  return (
    <section className="overflow-auto p-5">
      <Panel title="搜索结果">
        <RecentList files={results} onOpen={onOpen} />
      </Panel>
    </section>
  );
}
