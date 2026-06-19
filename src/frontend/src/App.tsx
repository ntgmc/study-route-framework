import CodeMirror from "@uiw/react-codemirror";
import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";
import { redo, undo } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  AlertCircle,
  ArrowUp,
  Archive,
  Bold,
  Bot,
  Check,
  CheckCircle2,
  Code2,
  Columns2,
  Download,
  Eye,
  FilePlus2,
  Folder,
  FolderPen,
  GitCompare,
  Image,
  Italic,
  Link,
  List,
  Loader2,
  Paperclip,
  PencilLine,
  Pin,
  Quote,
  Redo2,
  Save,
  Search,
  Settings,
  Star,
  Table2,
  Tags,
  Undo2,
  Upload,
  X
} from "lucide-react";
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import type { EditorView, ViewUpdate } from "@codemirror/view";
import type { AiApplyMode, AiSelectionRange, GitStatusResponse } from "../../../types/api";
import type { ExecutionAdjustmentSuggestion, FileMeta, RepoSummary, SectionKey } from "../../../types/domain";
import { client } from "./api";
import {
  clearDraft,
  getAllFileMeta,
  getDraft,
  getDraftVersions,
  getUiState,
  saveDraft,
  saveUiState,
  type DraftVersionRecord,
  type FileMetaRecord
} from "./drafts";
import { useAppStore } from "./store";
import { Button, DialogShell } from "./ui";

type EditorMode = "edit" | "split" | "preview";
type MarkdownAction = "bold" | "italic" | "list" | "table" | "code" | "link" | "image" | "quote";
type SaveState = "saved" | "dirty" | "saving";
type ToastKind = "success" | "error" | "info";

interface ToastMessage {
  id: number;
  message: string;
  kind: ToastKind;
  persistent?: boolean;
  actions?: ToastAction[];
  onDismiss?: () => void;
}

interface ToastAction {
  label: string;
  variant?: "primary" | "danger" | "plain";
  onClick: () => void;
}

const LazyAiDialog = lazy(() => import("./AiDialog"));
const LazyAiSettingsDialog = lazy(() => import("./AiSettingsDialog"));

const markdownSnippetCompletion = autocompletion({
  override: [
    (context: CompletionContext) => {
      const line = context.state.doc.lineAt(context.pos);
      const before = line.text.slice(0, context.pos - line.from);
      const options = [];

      if (before.endsWith("![")) {
        options.push({ label: "图片", type: "keyword", apply: "图片描述](image-url)" });
      } else if (before.endsWith("[")) {
        options.push({ label: "链接", type: "keyword", apply: "链接文本](https://example.com)" });
      }

      if (before.trim() === ">") {
        options.push({ label: "引用", type: "keyword", apply: "> 引用内容" });
      }

      if (!options.length) return null;
      return { from: context.pos, options };
    }
  ]
});

const focusLabels = {
  main_goal: "主目标",
  stage: "当前阶段",
  week: "本周重点",
  today: "今日任务"
} as const;

function IconButton(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  const { active = false, className = "", ...rest } = props;
  return (
    <button
      {...rest}
      className={`inline-grid h-9 w-9 place-items-center rounded-md border text-sm disabled:cursor-not-allowed disabled:opacity-50 ${
        active ? "border-brand bg-teal-50 text-brand" : "border-line bg-white text-ink hover:bg-slate-100"
      } ${className}`}
    />
  );
}

function SaveIndicator({ state }: { state: SaveState }) {
  const config = {
    saved: { label: "已保存", className: "bg-green-50 text-green-700", icon: CheckCircle2 },
    dirty: { label: "未保存", className: "bg-amber-50 text-amber-700", icon: AlertCircle },
    saving: { label: "保存中", className: "bg-blue-50 text-blue-700", icon: Loader2 }
  }[state];
  const Icon = config.icon;
  return (
    <span className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${config.className}`}>
      <Icon className={`h-3.5 w-3.5 ${state === "saving" ? "animate-spin" : ""}`} />
      {config.label}
    </span>
  );
}

function ToastStack({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (toast: ToastMessage) => void }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed right-4 top-4 z-50 grid w-[min(420px,calc(100vw-2rem))] gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`grid gap-3 rounded-lg border bg-white p-3 text-sm shadow-lg ${
            toast.kind === "error" ? "border-red-200 text-red-800" : toast.kind === "success" ? "border-green-200 text-green-800" : "border-slate-200 text-ink"
          }`}
        >
          <div className="flex items-start gap-2">
            {toast.kind === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
            <div className="min-w-0 flex-1 whitespace-pre-line [overflow-wrap:anywhere]">{toast.message}</div>
            <button type="button" className="grid h-6 w-6 shrink-0 place-items-center rounded hover:bg-slate-100" onClick={() => onDismiss(toast)} title="关闭">
              <X className="h-4 w-4" />
            </button>
          </div>
          {toast.actions?.length ? (
            <div className="flex flex-wrap justify-end gap-2">
              {toast.actions.map((action) => (
                <Button key={action.label} type="button" variant={action.variant} onClick={action.onClick}>
                  {action.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function normalizeTags(value: string): string[] {
  return [...new Set(value.split(/[,\s，、#]+/).map((tag) => tag.trim()).filter(Boolean))].slice(0, 12);
}

function extractInlineTags(text: string): string[] {
  return [...new Set(Array.from(text.matchAll(/(^|\s)#([\p{L}\p{N}_-]{2,24})/gu)).map((match) => match[2]))].slice(0, 12);
}

function formatVersionTime(value: number): string {
  return new Date(value).toLocaleString();
}

function exportMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".md") ? filename : `${filename}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".json") ? filename : `${filename}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readMetadataRecords(value: unknown): FileMetaRecord[] {
  const source = Array.isArray(value) ? value : isObject(value) && Array.isArray(value.records) ? value.records : null;
  if (!source) throw new Error("元数据文件格式不正确：缺少 records 数组");

  return source.map((item, index) => {
    if (!isObject(item) || typeof item.path !== "string" || !item.path.trim()) {
      throw new Error(`元数据文件格式不正确：第 ${index + 1} 条记录缺少 path`);
    }
    const tags = Array.isArray(item.tags) ? item.tags.filter((tag): tag is string => typeof tag === "string").join(",") : "";
    return {
      path: item.path.trim().replace(/\\/g, "/"),
      favorite: item.favorite === true,
      pinned: item.pinned === true,
      tags: normalizeTags(tags),
      updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : Date.now()
    };
  });
}

function buildLineDiff(left: string, right: string): Array<{ kind: "same" | "add" | "remove"; text: string; line: number }> {
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

function insertMarkdown(view: EditorView, action: MarkdownAction) {
  const selection = view.state.selection.main;
  const doc = view.state.doc;
  const selected = doc.sliceString(selection.from, selection.to);

  function replaceRange(insert: string, from = selection.from, to = selection.to, selectFrom?: number, selectTo?: number) {
    view.dispatch({
      changes: { from, to, insert },
      selection: { anchor: selectFrom ?? from + insert.length, head: selectTo ?? selectFrom ?? from + insert.length },
      scrollIntoView: true
    });
    view.focus();
  }

  function wrap(prefix: string, suffix: string, placeholder: string) {
    const inner = selected || placeholder;
    const insert = `${prefix}${inner}${suffix}`;
    const anchor = selection.from + prefix.length;
    replaceRange(insert, selection.from, selection.to, selected ? anchor + inner.length : anchor, anchor + inner.length);
  }

  function prefixLines(prefix: string) {
    const startLine = doc.lineAt(selection.from);
    const endLine = doc.lineAt(selection.to);
    const from = startLine.from;
    const to = endLine.to;
    const block = doc.sliceString(from, to);
    const insert = block
      .split("\n")
      .map((line) => (line.startsWith(prefix) ? line : `${prefix}${line}`))
      .join("\n");
    replaceRange(insert, from, to, from, from + insert.length);
  }

  switch (action) {
    case "bold":
      wrap("**", "**", "加粗文本");
      break;
    case "italic":
      wrap("*", "*", "斜体文本");
      break;
    case "list":
      prefixLines("- ");
      break;
    case "quote":
      prefixLines("> ");
      break;
    case "code": {
      const inner = selected || "代码";
      const insert = `\`\`\`markdown\n${inner}\n\`\`\``;
      replaceRange(insert, selection.from, selection.to, selection.from + 12, selection.from + 12 + inner.length);
      break;
    }
    case "table":
      replaceRange("\n| 列 1 | 列 2 |\n| --- | --- |\n| 内容 | 内容 |\n");
      break;
    case "link": {
      const label = selected || "链接文本";
      const insert = `[${label}](https://example.com)`;
      replaceRange(insert, selection.from, selection.to, selection.from + 1, selection.from + 1 + label.length);
      break;
    }
    case "image": {
      const label = selected || "图片描述";
      const insert = `![${label}](image-url)`;
      replaceRange(insert, selection.from, selection.to, selection.from + 2, selection.from + 2 + label.length);
      break;
    }
  }
}

function insertEditorText(view: EditorView, text: string) {
  const selection = view.state.selection.main;
  const prefix = selection.from > 0 && !view.state.doc.sliceString(selection.from - 1, selection.from).match(/\s/) ? "\n\n" : "";
  const suffix = text.endsWith("\n") ? "" : "\n";
  view.dispatch({
    changes: { from: selection.from, to: selection.to, insert: `${prefix}${text}${suffix}` },
    selection: { anchor: selection.from + prefix.length + text.length + suffix.length },
    scrollIntoView: true
  });
  view.focus();
}

function readAiSelection(view: EditorView | null): AiSelectionRange | undefined {
  if (!view) return undefined;
  const selection = view.state.selection.main;
  if (selection.empty) return undefined;
  const doc = view.state.doc;
  const startLine = doc.lineAt(selection.from);
  const endLine = doc.lineAt(selection.to);
  return {
    from: selection.from,
    to: selection.to,
    startLine: startLine.number,
    startColumn: selection.from - startLine.from + 1,
    endLine: endLine.number,
    endColumn: selection.to - endLine.from + 1,
    text: doc.sliceString(selection.from, selection.to)
  };
}

function MarkdownToolbar({ disabled, onAction }: { disabled: boolean; onAction: (action: MarkdownAction) => void }) {
  const items: Array<{ action: MarkdownAction; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { action: "bold", label: "加粗 Ctrl+B", icon: Bold },
    { action: "italic", label: "斜体 Ctrl+I", icon: Italic },
    { action: "list", label: "无序列表", icon: List },
    { action: "quote", label: "引用", icon: Quote },
    { action: "table", label: "表格", icon: Table2 },
    { action: "code", label: "代码块", icon: Code2 },
    { action: "link", label: "链接", icon: Link },
    { action: "image", label: "图片", icon: Image }
  ];
  return (
    <div className="flex flex-wrap items-center gap-1">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <IconButton key={item.action} type="button" disabled={disabled} title={item.label} onClick={() => onAction(item.action)}>
            <Icon className="h-4 w-4" />
          </IconButton>
        );
      })}
    </div>
  );
}

export function App() {
  const {
    summary,
    section,
    view,
    files,
    current,
    content,
    dirty,
    status,
    statusError,
    query,
    sort,
    searchResults,
    setState,
    setStatus
  } = useAppStore();
  const [createOpen, setCreateOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>("edit");
  const [draftVersions, setDraftVersions] = useState<DraftVersionRecord[]>([]);
  const [compareVersion, setCompareVersion] = useState<DraftVersionRecord | null>(null);
  const [legacyMetaRecords, setLegacyMetaRecords] = useState<Record<string, FileMetaRecord>>({});
  const [currentMetaRecord, setCurrentMetaRecord] = useState<FileMeta | null>(null);
  const [gitStatus, setGitStatus] = useState<GitStatusResponse | null>(null);
  const [gitBusy, setGitBusy] = useState(false);
  const [tagInput, setTagInput] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [pendingAiOperationId, setPendingAiOperationId] = useState("");
  const [aiSelection, setAiSelection] = useState<AiSelectionRange | undefined>(undefined);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [editorMountId, setEditorMountId] = useState(0);
  const editorViewRef = useRef<EditorView | null>(null);
  const previewRef = useRef<HTMLElement | null>(null);
  const autoSavingRef = useRef(false);
  const editorLineProgressRef = useRef(0);
  const previewSyncFrameRef = useRef<number | null>(null);
  const editorSyncFrameRef = useRef<number | null>(null);
  const scrollSyncSourceRef = useRef<"editor" | "preview" | null>(null);
  const scrollSyncResetFrameRef = useRef<number | null>(null);
  const showPreviewTopRef = useRef(false);
  const toastIdRef = useRef(1);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const [showPreviewTop, setShowPreviewTop] = useState(false);

  const showToast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = toastIdRef.current;
    toastIdRef.current += 1;
    setToasts((items) => [...items.slice(-3), { id, message, kind }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4200);
  }, []);

  const requestConfirmation = useCallback(
    (
      message: string,
      options: {
        confirmLabel?: string;
        cancelLabel?: string;
        kind?: ToastKind;
        confirmVariant?: "primary" | "danger" | "plain";
      } = {}
    ) =>
      new Promise<boolean>((resolve) => {
        const id = toastIdRef.current;
        toastIdRef.current += 1;
        let settled = false;
        const settle = (value: boolean) => {
          if (settled) return;
          settled = true;
          resolve(value);
          setToasts((items) => items.filter((item) => item.id !== id));
        };
        setToasts((items) => [
          ...items.slice(-3),
          {
            id,
            message,
            kind: options.kind ?? "info",
            persistent: true,
            onDismiss: () => settle(false),
            actions: [
              {
                label: options.cancelLabel ?? "取消",
                onClick: () => settle(false)
              },
              {
                label: options.confirmLabel ?? "确认",
                variant: options.confirmVariant ?? "primary",
                onClick: () => settle(true)
              }
            ]
          }
        ]);
      }),
    []
  );

  const requestToastAction = useCallback(
    (
      message: string,
      actions: Array<{
        label: string;
        value: string;
        variant?: "primary" | "danger" | "plain";
      }>,
      kind: ToastKind = "info"
    ) =>
      new Promise<string | undefined>((resolve) => {
        const id = toastIdRef.current;
        toastIdRef.current += 1;
        let settled = false;
        const settle = (value: string | undefined) => {
          if (settled) return;
          settled = true;
          resolve(value);
          setToasts((items) => items.filter((item) => item.id !== id));
        };
        setToasts((items) => [
          ...items.slice(-3),
          {
            id,
            message,
            kind,
            persistent: true,
            onDismiss: () => settle(undefined),
            actions: actions.map((action) => ({
              label: action.label,
              variant: action.variant,
              onClick: () => settle(action.value)
            }))
          }
        ]);
      }),
    []
  );

  const dismissToast = useCallback((toast: ToastMessage) => {
    toast.onDismiss?.();
    setToasts((items) => items.filter((item) => item.id !== toast.id));
  }, []);

  const confirmBeforeLeavingDirtyFile = useCallback(async () => {
    if (!useAppStore.getState().dirty) return true;
    return requestConfirmation("当前文件有未保存修改，确定离开吗？", {
      confirmLabel: "离开",
      cancelLabel: "继续编辑",
      confirmVariant: "danger"
    });
  }, [requestConfirmation]);

  const reportStatus = useCallback(
    (message: string, isError = false) => {
      setStatus(message, isError);
      showToast(message, isError ? "error" : "info");
    },
    [setStatus, showToast]
  );

  const setPreviewTopVisible = useCallback((visible: boolean) => {
    if (showPreviewTopRef.current === visible) return;
    showPreviewTopRef.current = visible;
    setShowPreviewTop(visible);
  }, []);

  const runWithScrollSource = useCallback((source: "editor" | "preview", run: () => void) => {
    if (scrollSyncResetFrameRef.current !== null) window.cancelAnimationFrame(scrollSyncResetFrameRef.current);
    scrollSyncSourceRef.current = source;
    run();
    scrollSyncResetFrameRef.current = window.requestAnimationFrame(() => {
      if (scrollSyncSourceRef.current === source) scrollSyncSourceRef.current = null;
      scrollSyncResetFrameRef.current = null;
    });
  }, []);

  const readEditorScrollProgress = useCallback((view: EditorView): number => {
    const maxScroll = Math.max(1, view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight);
    const progress = view.scrollDOM.scrollTop / maxScroll;
    const clamped = Math.min(1, Math.max(0, progress));
    editorLineProgressRef.current = clamped;
    return clamped;
  }, []);

  const syncPreviewToProgress = useCallback((progress = editorLineProgressRef.current) => {
    const preview = previewRef.current;
    if (!preview) return;
    const maxScroll = Math.max(0, preview.scrollHeight - preview.clientHeight);
    const nextTop = maxScroll * Math.min(1, Math.max(0, progress));
    if (Math.abs(preview.scrollTop - nextTop) > 1) {
      runWithScrollSource("editor", () => {
        preview.scrollTop = nextTop;
      });
    }
    setPreviewTopVisible(nextTop > 240);
  }, [runWithScrollSource, setPreviewTopVisible]);

  const schedulePreviewSync = useCallback(
    (progress = editorLineProgressRef.current) => {
      if (previewSyncFrameRef.current !== null) window.cancelAnimationFrame(previewSyncFrameRef.current);
      previewSyncFrameRef.current = window.requestAnimationFrame(() => {
        previewSyncFrameRef.current = null;
        syncPreviewToProgress(progress);
      });
    },
    [syncPreviewToProgress]
  );

  const readPreviewProgress = useCallback((preview: HTMLElement): number => {
    const maxScroll = Math.max(1, preview.scrollHeight - preview.clientHeight);
    const progress = Math.min(1, Math.max(0, preview.scrollTop / maxScroll));
    editorLineProgressRef.current = progress;
    return progress;
  }, []);

  const syncEditorToProgress = useCallback((view: EditorView, progress = editorLineProgressRef.current) => {
    const clamped = Math.min(1, Math.max(0, progress));
    const maxScroll = Math.max(0, view.scrollDOM.scrollHeight - view.scrollDOM.clientHeight);
    const nextTop = maxScroll * clamped;
    if (Math.abs(view.scrollDOM.scrollTop - nextTop) > 1) {
      runWithScrollSource("preview", () => {
        view.scrollDOM.scrollTop = nextTop;
      });
    }
    editorLineProgressRef.current = clamped;
  }, [runWithScrollSource]);

  const handlePreviewScroll = useCallback(
    (preview: HTMLElement) => {
      const progress = readPreviewProgress(preview);
      setPreviewTopVisible(preview.scrollTop > 240);
      if (editorMode !== "split" || !editorViewRef.current || scrollSyncSourceRef.current === "editor") return;
      const view = editorViewRef.current;
      syncEditorToProgress(view, progress);
    },
    [editorMode, readPreviewProgress, setPreviewTopVisible, syncEditorToProgress]
  );

  const scheduleEditorSync = useCallback(
    (progress = editorLineProgressRef.current) => {
      if (editorSyncFrameRef.current !== null) window.cancelAnimationFrame(editorSyncFrameRef.current);
      editorSyncFrameRef.current = window.requestAnimationFrame(() => {
        editorSyncFrameRef.current = null;
        if (editorViewRef.current) syncEditorToProgress(editorViewRef.current, progress);
      });
    },
    [syncEditorToProgress]
  );

  const setMode = useCallback(
    (mode: EditorMode) => {
      if (mode === "edit") {
        if (previewRef.current) scheduleEditorSync(readPreviewProgress(previewRef.current));
      } else if (editorViewRef.current) {
        schedulePreviewSync(readEditorScrollProgress(editorViewRef.current));
      }
      setEditorMode(mode);
      setState({ preview: mode === "preview" });
    },
    [readEditorScrollProgress, readPreviewProgress, scheduleEditorSync, schedulePreviewSync, setState]
  );

  const loadDraftVersions = useCallback(async (path: string) => {
    const versions = await getDraftVersions(path).catch(() => []);
    setDraftVersions(versions);
  }, []);

  const loadFileMetaRecords = useCallback(async () => {
    const records = await getAllFileMeta().catch(() => []);
    setLegacyMetaRecords(Object.fromEntries(records.map((record) => [record.path, record])));
  }, []);

  const refreshSummary = useCallback(async () => {
    const next = await client.summary();
    setState({ summary: next });
  }, [setState]);

  const refreshGitStatus = useCallback(async () => {
    const next = await client.gitStatus();
    setGitStatus(next);
  }, []);

  const loadFiles = useCallback(
    async (targetSection = section, targetQuery = query, targetSort = sort) => {
      if (targetSection === "dashboard") {
        setState({ files: [] });
        return;
      }
      const result = await client.files(targetSection, targetQuery, targetSort);
      setState({ files: result.files });
      const activePath = useAppStore.getState().current?.path;
      const active = activePath ? result.files.find((file) => file.path === activePath) : undefined;
      if (active) {
        setState({ current: active });
        setCurrentMetaRecord(active);
        setTagInput(active.tags.join(", "));
      }
    },
    [query, section, setState, sort]
  );

  const openFile = useCallback(
    async (path: string) => {
      if (!(await confirmBeforeLeavingDirtyFile())) return;
      const result = await client.file(path);
      let nextContent = result.content;
      let nextDirty = false;
      let discardedDraft = false;
      const draft = await getDraft(path).catch(() => undefined);
      if (draft && draft.content !== result.content) {
        const draftAction = await requestToastAction("检测到本地草稿。\n\n请选择恢复草稿，或丢弃草稿并打开文件。", [
          { label: "恢复草稿", value: "restore", variant: "primary" },
          { label: "丢弃草稿", value: "discard", variant: "danger" }
        ]);
        if (!draftAction) return;
        if (draftAction === "restore") {
          nextContent = draft.content;
          nextDirty = true;
        } else {
          await clearDraft(path).catch(() => undefined);
          discardedDraft = true;
        }
      }
      setState({
        current: result.meta,
        content: nextContent,
        dirty: nextDirty,
        preview: false,
        view: "manager"
      });
      setEditorMode("edit");
      editorLineProgressRef.current = 0;
      setSaveState(nextDirty ? "dirty" : "saved");
      setPendingAiOperationId("");
      setCompareVersion(null);
      await loadDraftVersions(result.meta.path);
      setCurrentMetaRecord(result.meta);
      setTagInput(result.meta.tags.join(", "));
      await saveUiState(result.meta.section, result.meta.path).catch(() => undefined);
      setStatus(discardedDraft ? `已丢弃 ${result.meta.path} 的本地草稿并打开文件` : `已打开 ${result.meta.path}`);
    },
    [confirmBeforeLeavingDirtyFile, loadDraftVersions, requestToastAction, setState, setStatus]
  );

  const selectSection = useCallback(
    async (target: SectionKey) => {
      if (!(await confirmBeforeLeavingDirtyFile())) return;
      const nextView = target === "dashboard" ? "dashboard" : "manager";
      setState({
        section: target,
        view: nextView,
        current: null,
        content: "",
        dirty: false,
        preview: false,
        query: ""
      });
      setEditorMode("edit");
      editorLineProgressRef.current = 0;
      setDraftVersions([]);
      setCompareVersion(null);
      setCurrentMetaRecord(null);
      setTagInput("");
      setTagFilter("");
      setSaveState("saved");
      await saveUiState(target, "").catch(() => undefined);
      if (target !== "dashboard") {
        const result = await client.files(target, "", sort);
        setState({ files: result.files });
        if (result.files[0]) await openFile(result.files[0].path);
      }
    },
    [confirmBeforeLeavingDirtyFile, openFile, setState, sort]
  );

  const openMeta = useCallback(
    async (file: FileMeta) => {
      if (file.section === "dashboard") {
        await selectSection("dashboard");
        setStatus("dashboard.md 可通过总览焦点表单编辑");
        return;
      }
      if (file.section !== "unknown") {
        setState({ section: file.section, view: "manager", query: "", current: null, content: "", dirty: false, preview: false });
        const result = await client.files(file.section, "", sort);
        setState({ files: result.files });
      }
      await openFile(file.path);
    },
    [openFile, selectSection, setState, setStatus, sort]
  );

  const init = useCallback(async () => {
    await loadFileMetaRecords();
    await refreshSummary();
    await refreshGitStatus().catch(() => undefined);
    const saved = await getUiState().catch(() => undefined);
    if (saved?.section && saved.section !== "dashboard") {
      await selectSection(saved.section as SectionKey);
      if (saved.path) await openFile(saved.path);
    } else {
      await selectSection("dashboard");
    }
  }, [loadFileMetaRecords, openFile, refreshGitStatus, refreshSummary, selectSection]);

  useEffect(() => {
    init().catch((error: Error) => setStatus(error.message, true));
  }, [init, setStatus]);

  useEffect(() => {
    if (statusError && status) showToast(status, "error");
  }, [showToast, status, statusError]);

  useEffect(() => {
    return () => {
      if (previewSyncFrameRef.current !== null) window.cancelAnimationFrame(previewSyncFrameRef.current);
      if (editorSyncFrameRef.current !== null) window.cancelAnimationFrame(editorSyncFrameRef.current);
      if (scrollSyncResetFrameRef.current !== null) window.cancelAnimationFrame(scrollSyncResetFrameRef.current);
    };
  }, []);

  useEffect(() => {
    const view = editorViewRef.current;
    if (!view || editorMode !== "split") return undefined;

    const handleEditorScroll = () => {
      if (scrollSyncSourceRef.current === "preview") return;
      syncPreviewToProgress(readEditorScrollProgress(view));
    };

    view.scrollDOM.addEventListener("scroll", handleEditorScroll, { passive: true });
    return () => view.scrollDOM.removeEventListener("scroll", handleEditorScroll);
  }, [editorMode, editorMountId, readEditorScrollProgress, syncPreviewToProgress]);

  useEffect(() => {
    if (editorMode === "edit") return;
    schedulePreviewSync();
  }, [content, current?.path, editorMode, schedulePreviewSync]);

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!useAppStore.getState().dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  const applyMarkdownAction = useCallback(
    (action: MarkdownAction) => {
      if (!current || !editorViewRef.current) return;
      insertMarkdown(editorViewRef.current, action);
    },
    [current]
  );

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (!current || editorMode === "preview") return;
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".cm-editor")) return;
      const key = event.key.toLowerCase();
      if ((event.ctrlKey || event.metaKey) && key === "b") {
        event.preventDefault();
        applyMarkdownAction("bold");
      }
      if ((event.ctrlKey || event.metaKey) && key === "i") {
        event.preventDefault();
        applyMarkdownAction("italic");
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [applyMarkdownAction, current, editorMode]);

  useEffect(() => {
    if (!current || !dirty) return;
    const path = current.path;
    const timer = window.setTimeout(() => {
      saveDraft(path, content)
        .then(() => loadDraftVersions(path))
        .catch(() => undefined);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [content, current, dirty, loadDraftVersions]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const snapshot = useAppStore.getState();
      if (!snapshot.current || !snapshot.dirty || autoSavingRef.current) return;

      autoSavingRef.current = true;
      setSaveState("saving");
      const path = snapshot.current.path;
      const savedContent = snapshot.content;
      client
        .saveFile({ path, content: savedContent })
        .then(async (result) => {
          await clearDraft(path).catch(() => undefined);
          const latest = useAppStore.getState();
          if (latest.current?.path === path) {
            setState({
              current: result.meta,
              dirty: latest.content === savedContent ? false : latest.dirty
            });
            setCurrentMetaRecord(result.meta);
            setTagInput(result.meta.tags.join(", "));
            setSaveState(latest.content === savedContent ? "saved" : "dirty");
            await loadDraftVersions(path);
          }
          await refreshSummary();
          await loadFiles();
          await refreshGitStatus().catch(() => undefined);
          reportStatus(`已自动保存 ${result.meta.path}`, false);
        })
        .catch((error: Error) => {
          setSaveState("dirty");
          setStatus(`自动保存失败：${error.message}`, true);
        })
        .finally(() => {
          autoSavingRef.current = false;
        });
    }, 30000);
    return () => window.clearInterval(timer);
  }, [loadDraftVersions, loadFiles, refreshGitStatus, refreshSummary, reportStatus, setState, setStatus]);

  async function updateCurrentMeta(patch: Partial<Pick<FileMeta, "tags" | "status" | "favorite" | "pinned">>) {
    if (!current) return;
    const result = await client.updateFileMeta({ path: current.path, ...patch });
    setCurrentMetaRecord(result.meta);
    setState({ current: result.meta });
    if (patch.tags) setTagInput(result.meta.tags.join(", "));
    await refreshSummary();
    await loadFiles();
    await refreshGitStatus().catch(() => undefined);
    setStatus(`已更新 ${current.path} 的版本化标记`);
  }

  function runEditorCommand(command: (view: EditorView) => boolean) {
    if (!editorViewRef.current) return;
    command(editorViewRef.current);
    editorViewRef.current.focus();
  }

  async function restoreDraftVersion(version: DraftVersionRecord): Promise<boolean> {
    if (!current) return false;
    const confirmed = await requestConfirmation("恢复这个本地草稿版本到编辑器？", {
      confirmLabel: "恢复",
      cancelLabel: "取消"
    });
    if (!confirmed) return false;
    setState({ content: version.content, dirty: true });
    setSaveState("dirty");
    setStatus(`已恢复 ${formatVersionTime(version.updatedAt)} 的草稿`);
    return true;
  }

  function exportSelectedDraft(version: DraftVersionRecord) {
    const baseName = current?.name || version.path.split("/").pop() || "draft.md";
    const stamp = new Date(version.updatedAt).toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
    exportMarkdown(`${baseName.replace(/\.md$/, "")}-${stamp}.md`, version.content);
    showToast("草稿已导出为 Markdown 文件", "success");
  }

  async function migrateLegacyMetadata() {
    const records = Object.values(legacyMetaRecords).filter((record) => record.favorite || record.pinned || record.tags.length);
    if (!records.length) {
      reportStatus("没有可迁移的本地标记", false);
      return;
    }
    const confirmed = await requestConfirmation(`把 ${records.length} 条浏览器本地标记写入 Markdown front matter？`, {
      confirmLabel: "迁移",
      cancelLabel: "取消"
    });
    if (!confirmed) return;
    let migrated = 0;
    for (const record of records) {
      try {
        await client.updateFileMeta({
          path: record.path,
          tags: record.tags,
          favorite: record.favorite,
          pinned: record.pinned
        });
        migrated += 1;
      } catch {
        // Ignore stale local records for files that no longer exist.
      }
    }
    await refreshSummary();
    await loadFiles();
    await refreshGitStatus().catch(() => undefined);
    if (current) {
      const refreshed = await client.file(current.path);
      setState({ current: refreshed.meta });
      setCurrentMetaRecord(refreshed.meta);
      setTagInput(refreshed.meta.tags.join(", "));
    }
    reportStatus(`已迁移 ${migrated} 条本地标记到 Markdown front matter`, false);
  }

  async function commitSnapshot() {
    setGitBusy(true);
    try {
      const result = await client.gitCommit({});
      setGitStatus(result.status);
      reportStatus(result.committed ? `已提交学习快照 ${result.hash ?? ""}`.trim() : result.message, false);
    } finally {
      setGitBusy(false);
    }
  }

  async function uploadAttachment(file: File) {
    if (!current || !editorViewRef.current) return;
    const result = await client.uploadAttachment(file);
    insertEditorText(editorViewRef.current, result.markdown);
    reportStatus(`附件已保存到 ${result.path}`, false);
  }

  function applyAiResult(payload: { content: string; operationId: string; applyMode: AiApplyMode; selection?: AiSelectionRange }) {
    const next = payload.content.trim();
    if (!next) return;
    if (payload.applyMode === "selection" && payload.selection && editorViewRef.current) {
      const view = editorViewRef.current;
      const currentSelectionText = view.state.doc.sliceString(payload.selection.from, payload.selection.to);
      if (currentSelectionText !== payload.selection.text) {
        setStatus("当前选区已变化，请重新选择并生成 AI 草案", true);
        return;
      }
      view.dispatch({
        changes: { from: payload.selection.from, to: payload.selection.to, insert: next },
        selection: { anchor: payload.selection.from + next.length },
        scrollIntoView: true
      });
      view.focus();
    } else if (payload.applyMode === "replace") {
      setState({ content: `${next}\n`, dirty: true });
    } else {
      const separator = content.endsWith("\n") || !content ? "" : "\n\n";
      setState({ content: `${content}${separator}${next}\n`, dirty: true });
    }
    setPendingAiOperationId(payload.operationId);
    setSaveState("dirty");
    setStatus("AI 草案已采纳到编辑器，保存后会写入文件并记录备份");
  }

  async function saveCurrent() {
    if (!current) return;
    setSaveState("saving");
    try {
      const result = await client.saveFile({
        path: current.path,
        content,
        ...(pendingAiOperationId ? { ai_operation_id: pendingAiOperationId } : {})
      });
      await clearDraft(current.path).catch(() => undefined);
      setState({ current: result.meta, dirty: false });
      setPendingAiOperationId("");
      setCurrentMetaRecord(result.meta);
      setTagInput(result.meta.tags.join(", "));
      setSaveState("saved");
      setPendingAiOperationId("");
      await loadDraftVersions(result.meta.path);
      await refreshSummary();
      await loadFiles();
      await refreshGitStatus().catch(() => undefined);
      const diffText = result.diff.changed ? `，diff：+${result.diff.added} -${result.diff.removed}` : "，无内容差异";
      reportStatus(`已保存 ${result.meta.path}${result.backup ? `，备份：${result.backup}` : ""}${diffText}`, false);
    } catch (error) {
      setSaveState("dirty");
      throw error;
    }
  }

  async function archiveCurrent() {
    if (!current) return;
    const confirmed = await requestConfirmation(`归档 ${current.path} 到 .trash/？`, {
      confirmLabel: "归档",
      cancelLabel: "取消",
      confirmVariant: "danger"
    });
    if (!confirmed) return;
    const result = await client.archiveFile({ path: current.path });
    await clearDraft(current.path).catch(() => undefined);
    setState({ current: null, content: "", dirty: false });
    await refreshSummary();
    await loadFiles();
    setStatus(`已归档到 ${result.archived_to}`);
  }

  async function runSearch(text: string) {
    if (dirty && !(await confirmBeforeLeavingDirtyFile())) return;
    if (!text.trim()) {
      await selectSection("dashboard");
      return;
    }
    const result = await client.search(text.trim());
    setState({ view: "search", searchResults: result.results, current: null, dirty: false });
  }

  const activeInfo = summary?.sections.find((item) => item.key === section);
  const source = summary?.dataMode === "external" ? "外部数据" : "Demo 数据";
  const isDemoData = summary?.dataMode !== "external";
  const currentInlineTags = useMemo(() => extractInlineTags(content), [content]);
  const currentTags = useMemo(() => {
    const localTags = currentMetaRecord?.tags ?? [];
    return [...new Set([...localTags, ...currentInlineTags])];
  }, [currentInlineTags, currentMetaRecord]);
  const allTags = useMemo(
    () => [...new Set(files.flatMap((file) => file.tags))].sort((left, right) => left.localeCompare(right)),
    [files]
  );
  const visibleFiles = useMemo(() => {
    const filtered = tagFilter ? files.filter((file) => file.tags.includes(tagFilter)) : files;
    return [...filtered].sort((left, right) => {
      if (Boolean(left.pinned) !== Boolean(right.pinned)) return left.pinned ? -1 : 1;
      if (Boolean(left.favorite) !== Boolean(right.favorite)) return left.favorite ? -1 : 1;
      return 0;
    });
  }, [files, tagFilter]);

  return (
    <div className="grid h-screen grid-cols-[252px_minmax(0,1fr)] overflow-hidden bg-app text-ink max-[920px]:grid-cols-1 max-[920px]:grid-rows-[auto_minmax(0,1fr)]">
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

      <main className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
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
            <Button onClick={() => {
              setAiSelection(readAiSelection(editorViewRef.current));
              setAiOpen(true);
            }}>
              <Bot className="h-4 w-4" />
              AI 生成
            </Button>
            <Button variant="primary" onClick={() => setCreateOpen(true)}>
              <FilePlus2 className="h-4 w-4" />
              新建
            </Button>
          </div>
        </header>

        {view === "dashboard" && summary ? (
          <Dashboard summary={summary} onOpen={openMeta} onRefresh={refreshSummary} />
        ) : null}

        {view === "manager" ? (
          <section className="grid h-full min-h-0 grid-cols-[minmax(280px,380px)_minmax(0,1fr)] overflow-hidden max-[920px]:grid-cols-1 max-[920px]:grid-rows-[minmax(190px,34vh)_minmax(460px,1fr)]">
            <aside className="min-h-0 overflow-auto border-r border-line bg-slate-50 p-4 max-[920px]:border-b max-[920px]:border-r-0">
              <div className="mb-3 grid grid-cols-[minmax(0,1fr)_132px] gap-2">
                <input
                  className="min-h-10 rounded-md border border-line px-3 text-sm"
                  value={query}
                  onChange={(event) => {
                    const next = event.target.value;
                    setState({ query: next });
                    loadFiles(section, next, sort).catch((error: Error) => setStatus(error.message, true));
                  }}
                  placeholder="筛选当前分类"
                />
                <select
                  className="min-h-10 rounded-md border border-line px-2 text-sm"
                  value={sort}
                  onChange={(event) => {
                    const next = event.target.value === "name" ? "name" : "updated";
                    setState({ sort: next });
                    loadFiles(section, query, next).catch((error: Error) => setStatus(error.message, true));
                  }}
                >
                  <option value="updated">按更新时间</option>
                  <option value="name">按文件名</option>
                </select>
              </div>
              <div className="mb-3 grid gap-2 rounded-md border border-line bg-white p-3">
                <div className="flex items-center gap-2 text-xs font-medium text-muted">
                  <Tags className="h-3.5 w-3.5" />
                  标签过滤
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    className={`rounded-full px-2 py-1 text-xs ${!tagFilter ? "bg-brand text-white" : "bg-slate-100 text-ink hover:bg-slate-200"}`}
                    onClick={() => setTagFilter("")}
                  >
                    全部
                  </button>
                  {allTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className={`rounded-full px-2 py-1 text-xs ${tagFilter === tag ? "bg-brand text-white" : "bg-slate-100 text-ink hover:bg-slate-200"}`}
                      onClick={() => setTagFilter(tag)}
                    >
                      #{tag}
                    </button>
                  ))}
                  {!allTags.length ? <span className="text-xs text-muted">暂无版本化标签</span> : null}
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-line pt-2">
                  <IconButton type="button" disabled={!Object.keys(legacyMetaRecords).length} title="迁移浏览器本地标记到 Markdown" onClick={() => migrateLegacyMetadata().catch((error: Error) => setStatus(error.message, true))}>
                    <Upload className="h-4 w-4" />
                  </IconButton>
                </div>
              </div>
              <FileTree files={visibleFiles} current={current} onOpen={openFile} />
            </aside>
            <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden bg-white">
              <div className="grid gap-2 border-b border-line px-4 py-2">
                <div className="flex min-h-10 items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="min-w-0 truncate text-sm text-muted">{current?.path || "未选择文件"}</div>
                    <SaveIndicator state={saveState} />
                  </div>
                  <div className="flex flex-wrap justify-end gap-2">
                    <IconButton
                      type="button"
                      disabled={!current}
                      active={Boolean(currentMetaRecord?.favorite)}
                      title="收藏"
                      onClick={() => updateCurrentMeta({ favorite: !currentMetaRecord?.favorite }).catch((error: Error) => setStatus(error.message, true))}
                    >
                      <Star className={`h-4 w-4 ${currentMetaRecord?.favorite ? "fill-current" : ""}`} />
                    </IconButton>
                    <IconButton
                      type="button"
                      disabled={!current}
                      active={Boolean(currentMetaRecord?.pinned)}
                      title="置顶"
                      onClick={() => updateCurrentMeta({ pinned: !currentMetaRecord?.pinned }).catch((error: Error) => setStatus(error.message, true))}
                    >
                      <Pin className={`h-4 w-4 ${currentMetaRecord?.pinned ? "fill-current" : ""}`} />
                    </IconButton>
                    <Button disabled={!current || current.path === "dashboard.md"} onClick={() => setRenameOpen(true)}>
                      <FolderPen className="h-4 w-4" />
                      重命名
                    </Button>
                    <Button disabled={!current || current.path === "dashboard.md"} variant="danger" onClick={() => archiveCurrent().catch((error: Error) => setStatus(error.message, true))}>
                      <Archive className="h-4 w-4" />
                      归档
                    </Button>
                    <Button disabled={!current} variant="primary" onClick={() => saveCurrent().catch((error: Error) => setStatus(error.message, true))}>
                      <Save className="h-4 w-4" />
                      保存
                    </Button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1">
                    <MarkdownToolbar disabled={!current || editorMode === "preview"} onAction={applyMarkdownAction} />
                    <IconButton type="button" disabled={!current || editorMode === "preview"} title="上传附件" onClick={() => attachmentInputRef.current?.click()}>
                      <Paperclip className="h-4 w-4" />
                    </IconButton>
                    <input
                      ref={attachmentInputRef}
                      className="hidden"
                      type="file"
                      accept="image/*,.pdf,application/pdf,*/*"
                      onChange={(event) => {
                        const file = event.currentTarget.files?.[0];
                        event.currentTarget.value = "";
                        if (file) uploadAttachment(file).catch((error: Error) => setStatus(error.message, true));
                      }}
                    />
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-2">
                    <label className="relative">
                      <Tags className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-muted" />
                      <input
                        className="min-h-9 w-[220px] rounded-md border border-line pl-8 pr-2 text-sm disabled:opacity-50"
                        disabled={!current}
                        value={tagInput}
                        placeholder="标签，用逗号分隔"
                        onChange={(event) => setTagInput(event.target.value)}
                        onBlur={() => updateCurrentMeta({ tags: normalizeTags(tagInput) }).catch((error: Error) => setStatus(error.message, true))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            updateCurrentMeta({ tags: normalizeTags(tagInput) }).catch((error: Error) => setStatus(error.message, true));
                          }
                        }}
                      />
                    </label>
                    <IconButton type="button" disabled={!current || editorMode === "preview"} title="撤销 Ctrl+Z" onClick={() => runEditorCommand(undo)}>
                      <Undo2 className="h-4 w-4" />
                    </IconButton>
                    <IconButton type="button" disabled={!current || editorMode === "preview"} title="重做 Ctrl+Shift+Z" onClick={() => runEditorCommand(redo)}>
                      <Redo2 className="h-4 w-4" />
                    </IconButton>
                    <select
                      className="min-h-9 max-w-[220px] rounded-md border border-line bg-white px-2 text-sm disabled:opacity-50"
                      disabled={!current || draftVersions.length === 0}
                      value=""
                      title="草稿版本"
                      onChange={(event) => {
                        const version = draftVersions.find((item) => item.id === event.target.value);
                        if (version) restoreDraftVersion(version).catch((error: Error) => setStatus(error.message, true));
                      }}
                    >
                      <option value="">草稿版本</option>
                      {draftVersions.map((version) => (
                        <option key={version.id} value={version.id}>
                          {new Date(version.updatedAt).toLocaleString()}
                        </option>
                      ))}
                    </select>
                    <IconButton type="button" disabled={!current || draftVersions.length === 0} title="版本对比" onClick={() => setCompareVersion(draftVersions[0] ?? null)}>
                      <GitCompare className="h-4 w-4" />
                    </IconButton>
                    <IconButton type="button" disabled={!current || draftVersions.length === 0} title="导出最新草稿" onClick={() => draftVersions[0] && exportSelectedDraft(draftVersions[0])}>
                      <Download className="h-4 w-4" />
                    </IconButton>
                    <div className="inline-flex gap-1 rounded-md border border-line bg-slate-50 p-1">
                      <IconButton type="button" disabled={!current} active={editorMode === "edit"} title="编辑" onClick={() => setMode("edit")}>
                        <PencilLine className="h-4 w-4" />
                      </IconButton>
                      <IconButton type="button" disabled={!current} active={editorMode === "split"} title="分屏预览" onClick={() => setMode("split")}>
                        <Columns2 className="h-4 w-4" />
                      </IconButton>
                      <IconButton type="button" disabled={!current} active={editorMode === "preview"} title="预览" onClick={() => setMode("preview")}>
                        <Eye className="h-4 w-4" />
                      </IconButton>
                    </div>
                  </div>
                </div>
                {currentTags.length ? (
                  <div className="flex flex-wrap gap-1">
                    {currentTags.map((tag) => (
                      <span key={tag} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                        #{tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className={`h-full min-h-0 overflow-hidden ${editorMode === "split" ? "grid grid-cols-2 max-[920px]:grid-cols-1 max-[920px]:grid-rows-2" : ""}`}>
                {editorMode !== "preview" ? (
                  <div className="h-full min-h-0 overflow-hidden">
                    <CodeMirror
                      value={content}
                      height="100%"
                      minHeight="100%"
                      extensions={[markdown(), markdownSnippetCompletion]}
                      editable={Boolean(current)}
                      basicSetup={{ lineNumbers: true, foldGutter: true }}
                      onCreateEditor={(view) => {
                        editorViewRef.current = view;
                        setEditorMountId((value) => value + 1);
                        scheduleEditorSync();
                      }}
                      onUpdate={(update: ViewUpdate) => {
                        if (!update.docChanged && !update.selectionSet) return;
                        const progress = readEditorScrollProgress(update.view);
                        if (editorMode !== "edit") schedulePreviewSync(progress);
                      }}
                      onChange={(value) => {
                        setState({ content: value, dirty: true });
                        setSaveState("dirty");
                        if (current) setStatus(`正在编辑 ${current.path}`);
                      }}
                      className="h-full text-sm"
                    />
                  </div>
                ) : null}
                {editorMode !== "edit" ? (
                  <div className={`relative h-full min-h-0 ${editorMode === "split" ? "border-l border-line max-[920px]:border-l-0 max-[920px]:border-t" : ""}`}>
                    <article
                      ref={previewRef}
                      className="markdown-preview h-full overflow-auto p-6"
                      onScroll={(event) => {
                        handlePreviewScroll(event.currentTarget);
                      }}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                        {content || "没有可预览内容"}
                      </ReactMarkdown>
                    </article>
                    {showPreviewTop ? (
                      <IconButton
                        type="button"
                        className="absolute bottom-4 right-4 shadow-lg"
                        title="回到顶部"
                        onClick={() => {
                          previewRef.current?.scrollTo({ top: 0, behavior: "smooth" });
                          setPreviewTopVisible(false);
                        }}
                      >
                        <ArrowUp className="h-4 w-4" />
                      </IconButton>
                    ) : null}
                  </div>
                ) : null}
              </div>
              <div className={`min-h-9 border-t border-line px-4 py-2 text-sm ${statusError ? "text-red-700" : "text-muted"}`}>{status}</div>
            </section>
          </section>
        ) : null}

        {view === "search" ? <SearchView results={searchResults} onOpen={openMeta} /> : null}
      </main>

      {createOpen ? <CreateDialog currentSection={section} onClose={() => setCreateOpen(false)} onCreated={async (file) => {
        setCreateOpen(false);
        await refreshSummary();
        await selectSection(file.section as SectionKey);
        await openFile(file.path);
      }} /> : null}
      {renameOpen && current ? <RenameDialog current={current} onClose={() => setRenameOpen(false)} onRenamed={async (file) => {
        setRenameOpen(false);
        await refreshSummary();
        await loadFiles();
        await openFile(file.path);
      }} /> : null}
      {aiOpen ? (
        <Suspense fallback={<DialogShell title="AI 生成" onClose={() => setAiOpen(false)}><div className="p-6 text-sm text-muted">加载中</div></DialogShell>}>
          <LazyAiDialog
            section={section}
            current={current}
            content={content}
            selection={aiSelection}
            onClose={() => setAiOpen(false)}
            onOpenSettings={() => setAiSettingsOpen(true)}
            onApply={(payload) => {
              applyAiResult(payload);
              setAiOpen(false);
            }}
          />
        </Suspense>
      ) : null}
      {aiSettingsOpen ? (
        <Suspense fallback={<DialogShell title="AI Provider 配置" onClose={() => setAiSettingsOpen(false)}><div className="p-6 text-sm text-muted">加载中</div></DialogShell>}>
          <LazyAiSettingsDialog onClose={() => setAiSettingsOpen(false)} />
        </Suspense>
      ) : null}
      {compareVersion ? (
        <DiffDialog
          version={compareVersion}
          currentContent={content}
          onClose={() => setCompareVersion(null)}
          onRestore={() => {
            restoreDraftVersion(compareVersion)
              .then((restored) => {
                if (restored) setCompareVersion(null);
              })
              .catch((error: Error) => setStatus(error.message, true));
          }}
          onExport={() => exportSelectedDraft(compareVersion)}
        />
      ) : null}
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function DiffDialog({
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

function Dashboard({ summary, onOpen, onRefresh }: { summary: RepoSummary; onOpen: (file: FileMeta) => Promise<void>; onRefresh: () => Promise<void> }) {
  const setStatus = useAppStore((state) => state.setStatus);
  const execution = summary.execution;
  const [focus, setFocus] = useState({
    main_goal: summary.focus[focusLabels.main_goal] || "",
    stage: summary.focus[focusLabels.stage] || "",
    week: summary.focus[focusLabels.week] || "",
    today: summary.focus[focusLabels.today] || ""
  });
  const [log, setLog] = useState({ date: summary.today, task: "", result: "", hours: "", evidence: "", takeaway: "", next: "" });

  useEffect(() => {
    setFocus({
      main_goal: summary.focus[focusLabels.main_goal] || "",
      stage: summary.focus[focusLabels.stage] || "",
      week: summary.focus[focusLabels.week] || "",
      today: summary.focus[focusLabels.today] || ""
    });
    setLog((current) => ({ ...current, date: summary.today }));
  }, [summary]);

  async function saveFocus() {
    await client.saveFocus(focus);
    await onRefresh();
    setStatus("dashboard 焦点已更新");
  }

  async function appendLog() {
    const result = await client.appendLog(log);
    setLog({ date: summary.today, task: "", result: "", hours: "", evidence: "", takeaway: "", next: "" });
    await onRefresh();
    setStatus(`已追加日志 ${result.path}`);
  }

  async function createPlanFromRoute() {
    const route = execution.routeProgress[0]?.route;
    if (!route) throw new Error("当前没有可用于生成周计划的路线");
    const result = await client.createPlanFromRoute({ routePath: route.path, week: execution.week });
    await onRefresh();
    await onOpen(result.meta);
    setStatus(result.existed ? `已打开现有周计划 ${result.path}` : `已生成周计划 ${result.path}`);
  }

  async function createLogFromPlan() {
    const plan = execution.activePlan;
    if (!plan) throw new Error("当前没有可用于生成今日日志的周计划");
    const result = await client.createLogFromPlan({ planPath: plan.path, date: summary.today });
    await onRefresh();
    await onOpen(result.meta);
    setStatus(result.existed ? `已打开今日日志 ${result.path}` : `已生成今日日志 ${result.path}`);
  }

  async function createReviewFromPlan(planPath = execution.activePlan?.path) {
    if (!planPath) throw new Error("当前没有可用于生成周复盘的计划");
    const result = await client.createReviewFromPlan({ planPath, week: execution.week });
    await onRefresh();
    await onOpen(result.meta);
    setStatus(result.existed ? `已打开现有周复盘 ${result.path}` : `已生成周复盘 ${result.path}`);
  }

  async function applySuggestion(suggestion: ExecutionAdjustmentSuggestion) {
    const routePath = suggestion.routePath || execution.routeProgress[0]?.route.path;
    if (!routePath) throw new Error("当前没有可应用调整建议的路线");
    const result = await client.applyRouteAdjustment({
      routePath,
      suggestion: suggestion.action,
      reason: suggestion.reason,
      date: summary.today
    });
    await onRefresh();
    await onOpen(result.meta);
    setStatus(`已追加路线调整 ${result.path}`);
  }

  const nextAction = useMemo(() => {
    if (execution.pendingReviews.length) {
      const item = execution.pendingReviews[0];
      return {
        title: "补齐周复盘",
        detail: `${item.plan.title} 还没写复盘。先记一下这周做完了什么、哪里卡住了、下周怎么改。`,
        label: "生成复盘",
        run: () => createReviewFromPlan(item.plan.path)
      };
    }
    if (!execution.todayTasks.length && execution.activePlan) {
      return {
        title: "生成今日日志",
        detail: "已经有周计划了，先开一篇今日日志，把今天要做的事写进去。",
        label: "生成今日日志",
        run: createLogFromPlan
      };
    }
    if (!execution.activePlan && execution.routeProgress.length) {
      return {
        title: "生成本周计划",
        detail: "路线里已经有当前阶段了，下一步是挑出这周真正要做的几件事。",
        label: "生成周计划",
        run: createPlanFromRoute
      };
    }
    if (execution.suggestions.length) {
      const suggestion = execution.suggestions[0];
      return {
        title: "处理路线调整",
        detail: suggestion.reason,
        label: "应用建议",
        run: () => applySuggestion(suggestion)
      };
    }
    return {
      title: execution.todayTasks[0]?.title || "继续推进今日任务",
      detail: execution.todayTasks[0] ? `${execution.todayTasks[0].status} · ${execution.todayTasks[0].source.path}` : "现在没有明显缺口，继续做今天的任务就行。",
      label: execution.todayTasks[0] ? "打开任务来源" : "刷新状态",
      run: () => execution.todayTasks[0] ? onOpen(execution.todayTasks[0].source) : onRefresh()
    };
  }, [execution, onOpen, onRefresh]);

  const flowSteps = [
    { label: "目标", state: focus.main_goal ? "done" : "empty", detail: focus.main_goal || "未填写" },
    { label: "路线", state: execution.routeProgress.length ? "done" : "empty", detail: execution.routeProgress[0]?.currentTheme || "未识别" },
    { label: "周计划", state: execution.activePlan ? "done" : "empty", detail: execution.activePlan?.title || "未生成" },
    { label: "今日日志", state: execution.todayTasks.length ? "active" : "empty", detail: `${execution.todayTasks.length} 个任务` },
    { label: "复盘", state: execution.pendingReviews.length ? "active" : "done", detail: execution.pendingReviews.length ? `${execution.pendingReviews.length} 个待复盘` : "无待处理" },
    { label: "调整", state: execution.suggestions.length ? "active" : "done", detail: execution.suggestions.length ? `${execution.suggestions.length} 条建议` : "无建议" }
  ] as const;

  return (
    <section className="overflow-auto p-5">
      <div className="mb-4 grid grid-cols-[minmax(0,1fr)_320px] gap-4 max-[1040px]:grid-cols-1">
        <section className="rounded-lg border border-line bg-white p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">下一步</div>
              <h2 className="mt-1 text-xl font-semibold [overflow-wrap:anywhere]">{nextAction.title}</h2>
              <p className="mt-1 text-sm text-muted [overflow-wrap:anywhere]">{nextAction.detail}</p>
            </div>
            <Button variant="primary" onClick={() => nextAction.run().catch((error: Error) => setStatus(error.message, true))}>
              <Check className="h-4 w-4" />
              {nextAction.label}
            </Button>
          </div>
          <div className="grid grid-cols-6 gap-2 max-[820px]:grid-cols-3 max-[520px]:grid-cols-2">
            {flowSteps.map((step, index) => (
              <div key={step.label} className={`min-h-24 rounded-md border p-3 ${step.state === "active" ? "border-brand bg-teal-50" : step.state === "done" ? "border-green-200 bg-green-50" : "border-line bg-slate-50"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-muted">{String(index + 1).padStart(2, "0")}</span>
                  <span className={`h-2.5 w-2.5 rounded-full ${step.state === "active" ? "bg-brand" : step.state === "done" ? "bg-green-600" : "bg-slate-300"}`} />
                </div>
                <div className="mt-2 font-semibold">{step.label}</div>
                <div className="mt-1 line-clamp-2 text-xs text-muted [overflow-wrap:anywhere]">{step.detail}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-white p-4">
          <h3 className="font-semibold">执行状态</h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              ["今日", execution.todayTasks.length],
              ["未完", execution.unfinishedTasks.length],
              ["阻塞", execution.blockers.length],
              ["复盘", execution.pendingReviews.length]
            ].map(([label, value]) => (
              <div key={label} className="rounded-md bg-slate-50 p-3">
                <strong className="block text-2xl leading-tight">{value}</strong>
                <span className="text-xs text-muted">{label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="mb-4 grid grid-cols-[minmax(0,1fr)_360px] gap-4 max-[1100px]:grid-cols-1">
        <div className="grid gap-4">
          <Panel
            title="执行"
            action={<Button variant="primary" onClick={() => createLogFromPlan().catch((error: Error) => setStatus(error.message, true))}><FilePlus2 className="h-4 w-4" />生成今日日志</Button>}
          >
            {execution.todayTasks.length ? (
              <div className="grid gap-2 p-3">
                {execution.todayTasks.map((task) => (
                  <div key={task.id} className="rounded-lg border border-line bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold [overflow-wrap:anywhere]">{task.title}</div>
                        <div className="mt-1 text-xs text-muted [overflow-wrap:anywhere]">
                          {task.status} · {task.sourceDetail}{task.dueDate ? ` · ${task.dueDate}` : ""}{task.output ? ` · ${task.output}` : ""}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <PriorityBadge value={task.priority} />
                        <Button type="button" onClick={() => onOpen(task.source).catch((error: Error) => setStatus(error.message, true))}>
                          <Eye className="h-4 w-4" />
                          打开
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="今天还没有明确任务。" />
            )}
          </Panel>

          <Panel
            title="路线与计划"
            action={<Button onClick={() => createPlanFromRoute().catch((error: Error) => setStatus(error.message, true))}><GitCompare className="h-4 w-4" />生成周计划</Button>}
          >
            <div className="grid grid-cols-2 gap-3 p-3 max-[820px]:grid-cols-1">
              <div className="grid gap-2">
                <h4 className="text-sm font-semibold text-muted">当前路线</h4>
                {execution.routeProgress.length ? execution.routeProgress.map((route) => (
                  <button key={route.route.path} type="button" className="rounded-lg border border-line bg-white p-3 text-left hover:border-brand" onClick={() => onOpen(route.route).catch((error: Error) => setStatus(error.message, true))}>
                    <div className="font-semibold [overflow-wrap:anywhere]">{route.currentTheme || route.route.title}</div>
                    <div className="mt-1 text-xs text-muted [overflow-wrap:anywhere]">阶段 {route.currentStage || "未标记"} · {route.status} · {route.keyTask || "未填写任务"}</div>
                  </button>
                )) : <EmptyState text="没有识别到路线阶段。" />}
              </div>
              <div className="grid gap-2">
                <h4 className="text-sm font-semibold text-muted">未完成计划</h4>
                {execution.unfinishedTasks.length ? execution.unfinishedTasks.slice(0, 5).map((task) => (
                  <button key={task.id} type="button" className="rounded-lg border border-line bg-white p-3 text-left hover:border-brand" onClick={() => onOpen(task.source).catch((error: Error) => setStatus(error.message, true))}>
                    <div className="font-semibold [overflow-wrap:anywhere]">{task.title}</div>
                    <div className="mt-1 text-xs text-muted [overflow-wrap:anywhere]">{task.status} · {task.source.path}{task.dueDate ? ` · ${task.dueDate}` : ""}</div>
                  </button>
                )) : <EmptyState text="没有未完成计划项。" />}
              </div>
            </div>
          </Panel>
        </div>

        <div className="grid gap-4">
        <Panel title="问题和产出">
            <div className="grid gap-3 p-3">
              <div>
                <h4 className="mb-2 text-sm font-semibold text-muted">阻塞项</h4>
                {execution.blockers.length ? execution.blockers.slice(0, 4).map((blocker) => (
                  <button key={blocker.id} type="button" className="mb-2 w-full rounded-lg border border-line bg-white p-3 text-left hover:border-brand" onClick={() => onOpen(blocker.source).catch((error: Error) => setStatus(error.message, true))}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-semibold [overflow-wrap:anywhere]">{blocker.problem}</div>
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">{blocker.count} 次</span>
                    </div>
                    <div className="mt-1 text-xs text-muted [overflow-wrap:anywhere]">{blocker.nextStep || "下一步未填写"} · {blocker.source.path}</div>
                  </button>
                )) : <EmptyState text="没有阻塞项。" />}
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold text-muted">最近产出</h4>
                {execution.evidence.length ? execution.evidence.slice(0, 4).map((item) => (
                  <button key={item.id} type="button" className="mb-2 w-full rounded-lg border border-line bg-white p-3 text-left hover:border-brand" onClick={() => onOpen(item.source).catch((error: Error) => setStatus(error.message, true))}>
                    <div className="font-semibold [overflow-wrap:anywhere]">{item.title}</div>
                    <div className="mt-1 text-xs text-muted [overflow-wrap:anywhere]">{item.detail} · {item.source.path}</div>
                  </button>
                )) : <EmptyState text="还没有可追踪产出。" />}
              </div>
            </div>
          </Panel>

        <Panel title="复盘和下一步">
            <div className="grid gap-3 p-3">
              {execution.pendingReviews.slice(0, 3).map((item) => (
                <div key={item.id} className="rounded-lg border border-line bg-white p-3">
                  <div className="font-semibold [overflow-wrap:anywhere]">{item.plan.title}</div>
                  <div className="mt-1 text-xs text-muted [overflow-wrap:anywhere]">{item.reason}</div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button type="button" onClick={() => onOpen(item.plan).catch((error: Error) => setStatus(error.message, true))}>打开计划</Button>
                    <Button type="button" variant="primary" onClick={() => createReviewFromPlan(item.plan.path).catch((error: Error) => setStatus(error.message, true))}>
                      <FilePlus2 className="h-4 w-4" />
                      生成复盘
                    </Button>
                  </div>
                </div>
              ))}
              {execution.suggestions.slice(0, 3).map((suggestion) => (
                <div key={suggestion.id} className="rounded-lg border border-line bg-white p-3">
                  <div className="font-semibold [overflow-wrap:anywhere]">{suggestion.title}</div>
                  <div className="mt-1 text-xs text-muted [overflow-wrap:anywhere]">{suggestion.reason}</div>
                  <div className="mt-2 text-sm [overflow-wrap:anywhere]">{suggestion.action}</div>
                  <div className="mt-3 flex justify-end">
                    <Button type="button" variant="primary" onClick={() => applySuggestion(suggestion).catch((error: Error) => setStatus(error.message, true))}>
                      <Check className="h-4 w-4" />
                      应用到路线
                    </Button>
                  </div>
                </div>
              ))}
              {!execution.pendingReviews.length && !execution.suggestions.length ? <EmptyState text="没有待复盘或调整建议。" /> : null}
            </div>
          </Panel>
        </div>
      </section>

      <details className="mb-4 rounded-lg border border-line bg-white">
        <summary className="cursor-pointer px-4 py-3 font-semibold">手动维护</summary>
        <Panel title="当前焦点" action={<Button variant="primary" onClick={() => saveFocus().catch((error: Error) => setStatus(error.message, true))}><Check className="h-4 w-4" />保存焦点</Button>}>
          <div className="grid grid-cols-2 gap-3 p-4 max-[920px]:grid-cols-1">
            <label className="row-span-2 grid gap-1 text-sm text-muted">
              主目标
              <textarea className="min-h-28 rounded-md border border-line p-2 text-ink" value={focus.main_goal} onChange={(event) => setFocus({ ...focus, main_goal: event.target.value })} />
            </label>
            <Input label="当前阶段" value={focus.stage} onChange={(value) => setFocus({ ...focus, stage: value })} />
            <Input label="本周重点" value={focus.week} onChange={(value) => setFocus({ ...focus, week: value })} />
            <Input label="今日任务" value={focus.today} onChange={(value) => setFocus({ ...focus, today: value })} />
          </div>
        </Panel>
        <Panel title="追加今日日志" action={<Button variant="primary" onClick={() => appendLog().catch((error: Error) => setStatus(error.message, true))}><Check className="h-4 w-4" />追加</Button>}>
          <div className="grid grid-cols-2 gap-3 p-4 max-[920px]:grid-cols-1">
            <Input label="日期" type="date" value={log.date} onChange={(value) => setLog({ ...log, date: value })} />
            <Input label="任务" value={log.task} onChange={(value) => setLog({ ...log, task: value })} />
            <Input label="结果" value={log.result} onChange={(value) => setLog({ ...log, result: value })} />
            <Input label="用时" value={log.hours} onChange={(value) => setLog({ ...log, hours: value })} />
            <Input label="证据或产出" value={log.evidence} onChange={(value) => setLog({ ...log, evidence: value })} />
            <Input label="关键收获" value={log.takeaway} onChange={(value) => setLog({ ...log, takeaway: value })} />
            <Input label="明日计划" value={log.next} onChange={(value) => setLog({ ...log, next: value })} />
          </div>
        </Panel>
      </details>

      <details className="rounded-lg border border-line bg-white">
        <summary className="cursor-pointer px-4 py-3 font-semibold">最近更新</summary>
        <RecentList files={summary.recent} onOpen={onOpen} />
      </details>
    </section>
  );
}

function PriorityBadge({ value }: { value: "high" | "medium" | "low" }) {
  const config = {
    high: "bg-red-50 text-red-700",
    medium: "bg-amber-50 text-amber-700",
    low: "bg-slate-100 text-slate-600"
  }[value];
  const label = { high: "高", medium: "中", low: "低" }[value];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${config}`}>{label}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="p-6 text-center text-sm text-muted">{text}</div>;
}

function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-4 rounded-lg border border-line bg-white">
      <div className="flex min-h-[52px] items-center justify-between gap-3 border-b border-line px-4 py-2">
        <h3 className="font-semibold">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="grid gap-1 text-sm text-muted">
      {label}
      <input className="min-h-10 rounded-md border border-line px-3 text-ink" type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function FileTree({
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

function RecentList({ files, onOpen }: { files: FileMeta[]; onOpen: (file: FileMeta) => Promise<void> }) {
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

function SearchView({ results, onOpen }: { results: FileMeta[]; onOpen: (file: FileMeta) => Promise<void> }) {
  return (
    <section className="overflow-auto p-5">
      <Panel title="搜索结果">
        <RecentList files={results} onOpen={onOpen} />
      </Panel>
    </section>
  );
}

function CreateDialog({ currentSection, onClose, onCreated }: { currentSection: SectionKey; onClose: () => void; onCreated: (file: FileMeta) => Promise<void> }) {
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

function RenameDialog({ current, onClose, onRenamed }: { current: FileMeta; onClose: () => void; onRenamed: (file: FileMeta) => Promise<void> }) {
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
