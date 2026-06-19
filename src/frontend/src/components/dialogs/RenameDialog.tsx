import { useState } from "react";
import type { FileMeta } from "../../../../../types/domain";
import { client } from "../../api";
import { useAppStore } from "../../store";
import { Button, DialogShell } from "../../ui";
import { Input } from "../common";

export function RenameDialog({ current, onClose, onRenamed }: { current: FileMeta; onClose: () => void; onRenamed: (file: FileMeta) => Promise<void> }) {
  const setStatus = useAppStore((state) => state.setStatus);
  const [name, setName] = useState(current.name);
  async function submit() {
    const result = await client.renameFile({ path: current.path, name });
    setStatus(`已重命名为 ${result.meta.path}`);
    await onRenamed(result.meta);
  }
  return (
    <DialogShell title="重命名文件" onClose={onClose}>
      <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); submit().catch((error: Error) => setStatus(error.message, true)); }}>
        <Input label="新文件名" value={name} onChange={setName} />
        <div className="flex justify-end gap-2">
          <Button type="button" onClick={onClose}>取消</Button>
          <Button type="submit" variant="primary">保存</Button>
        </div>
      </form>
    </DialogShell>
  );
}
