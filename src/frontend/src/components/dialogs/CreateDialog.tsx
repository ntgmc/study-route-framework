import { useMemo, useState } from "react";
import type { FileMeta, SectionKey } from "../../../../../types/domain";
import { client } from "../../api";
import { useAppStore } from "../../store";
import { Button, DialogShell } from "../../ui";
import { Input } from "../common";

export function CreateDialog({ currentSection, onClose, onCreated }: { currentSection: SectionKey; onClose: () => void; onCreated: (file: FileMeta) => Promise<void> }) {
  const summary = useAppStore((state) => state.summary);
  const setStatus = useAppStore((state) => state.setStatus);
  const [section, setSection] = useState<SectionKey>(currentSection === "dashboard" ? "plans" : currentSection);
  const [title, setTitle] = useState("");
  const [name, setName] = useState("");
  const sections = useMemo(() => summary?.sections.filter((item) => item.key !== "dashboard") ?? [], [summary]);

  async function submit() {
    const result = await client.createFile({ section, title, name });
    setStatus(`已创建 ${result.meta.path}`);
    await onCreated(result.meta);
  }

  return (
    <DialogShell title="新建 Markdown" onClose={onClose}>
      <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); submit().catch((error: Error) => setStatus(error.message, true)); }}>
        <label className="grid gap-1 text-sm text-muted">分类<select className="min-h-10 rounded-md border border-line px-3 text-ink" value={section} onChange={(event) => setSection(event.target.value as SectionKey)}>{sections.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}</select></label>
        <Input label="标题" value={title} onChange={(value) => { setTitle(value); if (!name.trim()) setName(value.trim().replace(/\s+/g, "-") ? `${value.trim().replace(/\s+/g, "-")}.md` : ""); }} />
        <Input label="文件名" value={name} onChange={setName} />
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary">创建</Button>
        </div>
      </form>
    </DialogShell>
  );
}
