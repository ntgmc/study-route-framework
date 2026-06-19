export type EditorMode = "edit" | "split" | "preview";
export type MarkdownAction = "bold" | "italic" | "list" | "table" | "code" | "link" | "image" | "quote";
export type SaveState = "saved" | "dirty" | "saving";
export type ToastKind = "success" | "error" | "info";

export interface ToastMessage {
  id: number;
  message: string;
  kind: ToastKind;
  persistent?: boolean;
  actions?: ToastAction[];
  onDismiss?: () => void;
}

export interface ToastAction {
  label: string;
  variant?: "primary" | "danger" | "plain";
  testId?: string;
  onClick: () => void;
}


export type LineDiffRow = { kind: "same" | "add" | "remove"; text: string; line: number };

export function formatVersionTime(value: number): string {
  return new Date(value).toLocaleString();
}

export function buildLineDiff(left: string, right: string): LineDiffRow[] {
  const leftLines = left.split(/\r?\n/);
  const rightLines = right.split(/\r?\n/);
  const rows: Array<{ kind: "same" | "add" | "remove"; text: string; line: number }> = [];
  const max = Math.max(leftLines.length, rightLines.length);
  for (let index = 0; index < max; index += 1) {
    const before = leftLines[index];
    const after = rightLines[index];
    if (before === after) {
      rows.push({ kind: "same", text: before ?? "", line: index + 1 });
    } else {
      if (before !== undefined) rows.push({ kind: "remove", text: before, line: index + 1 });
      if (after !== undefined) rows.push({ kind: "add", text: after, line: index + 1 });
    }
  }
  return rows;
}
