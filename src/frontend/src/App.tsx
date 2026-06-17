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
  PencilLine,
  Pin,
  Quote,
  Redo2,
  Save,
  Search,
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
import type { FileMeta, RepoSummary, SectionKey } from "../../../types/domain";
import { client } from "./api";
import {
  clearDraft,
  getAllFileMeta,
  getDraft,
  getDraftVersions,
  getFileMeta,
  getUiState,
  saveDraft,
  saveFileMeta,
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
}

interface MetadataExportPayload {
  version: 1;
  exportedAt: string;
  records: FileMetaRecord[];
}

const LazyAiDialog = lazy(() => import("./AiDialog"));

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

function confirmLeave(dirty: boolean): boolean {
  return !dirty || window.confirm("当前文件有未保存修改，确定离开吗？");
}

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

function ToastStack({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (id: number) => void }) {
  if (!toasts.length) return null;
  return (
    <div className="fixed right-4 top-4 z-50 grid w-[min(360px,calc(100vw-2rem))] gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-start gap-2 rounded-lg border bg-white p-3 text-sm shadow-lg ${
            toast.kind === "error" ? "border-red-200 text-red-800" : toast.kind === "success" ? "border-green-200 text-green-800" : "border-slate-200 text-ink"
          }`}
        >
          {toast.kind === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">{toast.message}</div>
          <button type="button" className="grid h-6 w-6 shrink-0 place-items-center rounded hover:bg-slate-100" onClick={() => onDismiss(toast.id)} title="关闭">
            <X className="h-4 w-4" />
          </button>
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
  const [editorMode, setEditorMode] = useState<EditorMode>("edit");
  const [draftVersions, setDraftVersions] = useState<DraftVersionRecord[]>([]);
  const [compareVersion, setCompareVersion] = useState<DraftVersionRecord | null>(null);
  const [fileMetaRecords, setFileMetaRecords] = useState<Record<string, FileMetaRecord>>({});
  const [currentMetaRecord, setCurrentMetaRecord] = useState<FileMetaRecord | null>(null);
  const [tagInput, setTagInput] = useState("");
  const [tagFilter, setTagFilter] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("saved");
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
  const metadataInputRef = useRef<HTMLInputElement | null>(null);
  const [showPreviewTop, setShowPreviewTop] = useState(false);

  const showToast = useCallback((message: string, kind: ToastKind = "info") => {
    const id = toastIdRef.current;
    toastIdRef.current += 1;
    setToasts((items) => [...items.slice(-3), { id, message, kind }]);
    window.setTimeout(() => setToasts((items) => items.filter((item) => item.id !== id)), 4200);
  }, []);

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
    setFileMetaRecords(Object.fromEntries(records.map((record) => [record.path, record])));
  }, []);

  const refreshSummary = useCallback(async () => {
    const next = await client.summary();
    setState({ summary: next });
  }, [setState]);

  const loadFiles = useCallback(
    async (targetSection = section, targetQuery = query, targetSort = sort) => {
      if (targetSection === "dashboard") {
        setState({ files: [] });
        return;
      }
      const result = await client.files(targetSection, targetQuery, targetSort);
      setState({ files: result.files });
    },
    [query, section, setState, sort]
  );

  const openFile = useCallback(
    async (path: string) => {
      if (!confirmLeave(useAppStore.getState().dirty)) return;
      const result = await client.file(path);
      let nextContent = result.content;
      let nextDirty = false;
      let discardedDraft = false;
      const draft = await getDraft(path).catch(() => undefined);
      if (draft && draft.content !== result.content) {
        if (window.confirm("检测到本地草稿。\n\n选择“确定”恢复到编辑器；选择“取消”丢弃草稿并打开文件。")) {
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
      setCompareVersion(null);
      await loadDraftVersions(result.meta.path);
      const meta = await getFileMeta(result.meta.path);
      setCurrentMetaRecord(meta);
      setTagInput(meta.tags.join(", "));
      await saveUiState(result.meta.section, result.meta.path).catch(() => undefined);
      setStatus(discardedDraft ? `已丢弃 ${result.meta.path} 的本地草稿并打开文件` : `已打开 ${result.meta.path}`);
    },
    [loadDraftVersions, setState, setStatus]
  );

  const selectSection = useCallback(
    async (target: SectionKey) => {
      if (!confirmLeave(useAppStore.getState().dirty)) return;
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
    [openFile, setState, sort]
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
    const saved = await getUiState().catch(() => undefined);
    if (saved?.section && saved.section !== "dashboard") {
      await selectSection(saved.section as SectionKey);
      if (saved.path) await openFile(saved.path);
    } else {
      await selectSection("dashboard");
    }
  }, [loadFileMetaRecords, openFile, refreshSummary, selectSection]);

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
            setSaveState(latest.content === savedContent ? "saved" : "dirty");
            await loadDraftVersions(path);
          }
          await refreshSummary();
          await loadFiles();
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
  }, [loadDraftVersions, loadFiles, refreshSummary, reportStatus, setState, setStatus]);

  async function updateCurrentMeta(patch: Partial<Omit<FileMetaRecord, "path" | "updatedAt">>) {
    if (!current) return;
    const base = currentMetaRecord ?? (await getFileMeta(current.path));
    const next = { ...base, ...patch, path: current.path, updatedAt: Date.now() };
    await saveFileMeta(next);
    setCurrentMetaRecord(next);
    if (patch.tags) setTagInput(next.tags.join(", "));
    setFileMetaRecords((records) => ({ ...records, [next.path]: next }));
    setStatus(`已更新 ${current.path} 的本地标记`);
  }

  function runEditorCommand(command: (view: EditorView) => boolean) {
    if (!editorViewRef.current) return;
    command(editorViewRef.current);
    editorViewRef.current.focus();
  }

  function restoreDraftVersion(version: DraftVersionRecord) {
    if (!current) return;
    if (!window.confirm("恢复这个本地草稿版本到编辑器？")) return;
    setState({ content: version.content, dirty: true });
    setSaveState("dirty");
    setStatus(`已恢复 ${formatVersionTime(version.updatedAt)} 的草稿`);
  }

  function exportSelectedDraft(version: DraftVersionRecord) {
    const baseName = current?.name || version.path.split("/").pop() || "draft.md";
    const stamp = new Date(version.updatedAt).toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
    exportMarkdown(`${baseName.replace(/\.md$/, "")}-${stamp}.md`, version.content);
    showToast("草稿已导出为 Markdown 文件", "success");
  }

  function exportMetadata() {
    const records = Object.values(fileMetaRecords).sort((left, right) => left.path.localeCompare(right.path));
    const payload: MetadataExportPayload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      records
    };
    const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
    exportJson(`study-route-metadata-${stamp}.json`, payload);
    showToast(`已导出 ${records.length} 条本地标记`, "success");
  }

  async function importMetadata(file: File) {
    const text = await file.text();
    const parsed = JSON.parse(text) as unknown;
    const records = readMetadataRecords(parsed);
    await Promise.all(records.map((record) => saveFileMeta(record)));
    const refreshed = await getAllFileMeta();
    const mapped = Object.fromEntries(refreshed.map((record) => [record.path, record]));
    setFileMetaRecords(mapped);
    if (current) {
      const next = mapped[current.path] ?? (await getFileMeta(current.path));
      setCurrentMetaRecord(next);
      setTagInput(next.tags.join(", "));
    }
    reportStatus(`已导入 ${records.length} 条本地标记`, false);
  }

  async function saveCurrent() {
    if (!current) return;
    setSaveState("saving");
    try {
      const result = await client.saveFile({ path: current.path, content });
      await clearDraft(current.path).catch(() => undefined);
      setState({ current: result.meta, dirty: false });
      setSaveState("saved");
      await loadDraftVersions(result.meta.path);
      await refreshSummary();
      await loadFiles();
      reportStatus(`已保存 ${result.meta.path}${result.backup ? `，备份：${result.backup}` : ""}`, false);
    } catch (error) {
      setSaveState("dirty");
      throw error;
    }
  }

  async function archiveCurrent() {
    if (!current) return;
    if (!window.confirm(`归档 ${current.path} 到 .trash/？`)) return;
    const result = await client.archiveFile({ path: current.path });
    await clearDraft(current.path).catch(() => undefined);
    setState({ current: null, content: "", dirty: false });
    await refreshSummary();
    await loadFiles();
    setStatus(`已归档到 ${result.archived_to}`);
  }

  async function runSearch(text: string) {
    if (!confirmLeave(dirty)) return;
    if (!text.trim()) {
      await selectSection("dashboard");
      return;
    }
    const result = await client.search(text.trim());
    setState({ view: "search", searchResults: result.results, current: null, dirty: false });
  }

  const activeInfo = summary?.sections.find((item) => item.key === section);
  const source = summary?.dataMode === "external" ? "外部数据" : "Demo 数据";
  const currentInlineTags = useMemo(() => extractInlineTags(content), [content]);
  const currentTags = useMemo(() => {
    const localTags = currentMetaRecord?.tags ?? [];
    return [...new Set([...localTags, ...currentInlineTags])];
  }, [currentInlineTags, currentMetaRecord]);
  const allTags = useMemo(
    () => [...new Set(Object.values(fileMetaRecords).flatMap((record) => record.tags))].sort((left, right) => left.localeCompare(right)),
    [fileMetaRecords]
  );
  const visibleFiles = useMemo(() => {
    const filtered = tagFilter ? files.filter((file) => fileMetaRecords[file.path]?.tags.includes(tagFilter)) : files;
    return [...filtered].sort((left, right) => {
      const leftMeta = fileMetaRecords[left.path];
      const rightMeta = fileMetaRecords[right.path];
      if (Boolean(leftMeta?.pinned) !== Boolean(rightMeta?.pinned)) return leftMeta?.pinned ? -1 : 1;
      if (Boolean(leftMeta?.favorite) !== Boolean(rightMeta?.favorite)) return leftMeta?.favorite ? -1 : 1;
      return 0;
    });
  }, [fileMetaRecords, files, tagFilter]);

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
      </aside>

      <main className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <header className="flex min-h-[74px] items-center justify-between gap-4 border-b border-line bg-white px-6 py-3 max-[920px]:items-stretch max-[920px]:flex-col">
          <div className="min-w-0">
            <h2 className="truncate text-xl font-semibold">{view === "search" ? "全局搜索" : activeInfo?.label || "总览"}</h2>
            <p className="truncate text-xs text-muted">
              {view === "search"
                ? `${searchResults.length} 个结果`
                : activeInfo
                  ? `${activeInfo.count} 个文件 · ${source} · ${summary?.dataRoot || ""}`
                  : "加载中"}
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
            <Button onClick={() => setAiOpen(true)}>
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
                  {!allTags.length ? <span className="text-xs text-muted">暂无本地标签</span> : null}
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-line pt-2">
                  <IconButton type="button" disabled={!Object.keys(fileMetaRecords).length} title="导出标签/收藏/置顶" onClick={exportMetadata}>
                    <Download className="h-4 w-4" />
                  </IconButton>
                  <IconButton type="button" title="导入标签/收藏/置顶" onClick={() => metadataInputRef.current?.click()}>
                    <Upload className="h-4 w-4" />
                  </IconButton>
                  <input
                    ref={metadataInputRef}
                    className="hidden"
                    type="file"
                    accept=".json,application/json"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      event.currentTarget.value = "";
                      if (file) importMetadata(file).catch((error: Error) => setStatus(error.message, true));
                    }}
                  />
                </div>
              </div>
              <FileTree files={visibleFiles} current={current} metaRecords={fileMetaRecords} onOpen={openFile} />
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
                  <MarkdownToolbar disabled={!current || editorMode === "preview"} onAction={applyMarkdownAction} />
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
                        if (version) restoreDraftVersion(version);
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
        <Suspense fallback={<DialogShell title="DeepSeek 生成" onClose={() => setAiOpen(false)}><div className="p-6 text-sm text-muted">加载中</div></DialogShell>}>
          <LazyAiDialog section={section} current={current} content={content} onClose={() => setAiOpen(false)} onApply={(next, replace) => {
            const separator = content.endsWith("\n") || !content ? "" : "\n\n";
            setState({ content: replace ? `${next.trim()}\n` : `${content}${separator}${next.trim()}\n`, dirty: true });
            setSaveState("dirty");
            setStatus("AI 生成内容已写入编辑器，保存后才会更新文件");
          }} />
        </Suspense>
      ) : null}
      {compareVersion ? (
        <DiffDialog
          version={compareVersion}
          currentContent={content}
          onClose={() => setCompareVersion(null)}
          onRestore={() => {
            restoreDraftVersion(compareVersion);
            setCompareVersion(null);
          }}
          onExport={() => exportSelectedDraft(compareVersion)}
        />
      ) : null}
      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((items) => items.filter((item) => item.id !== id))} />
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

  return (
    <section className="overflow-auto p-5">
      <div className="mb-4 grid grid-cols-4 gap-3 max-[920px]:grid-cols-1">
        {[
          ["文件", summary.stats.files],
          ["分类", summary.stats.sections],
          ["日志", summary.stats.logs],
          ["计划", summary.stats.plans]
        ].map(([label, value]) => (
          <div key={label} className="rounded-lg border border-line bg-white p-4">
            <strong className="block text-3xl leading-tight">{value}</strong>
            <span className="text-sm text-muted">{label}</span>
          </div>
        ))}
      </div>

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

      <Panel title="最近更新">
        <RecentList files={summary.recent} onOpen={onOpen} />
      </Panel>
    </section>
  );
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
  metaRecords,
  onOpen
}: {
  files: FileMeta[];
  current: FileMeta | null;
  metaRecords: Record<string, FileMetaRecord>;
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
              const meta = metaRecords[file.path];
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
                      {meta?.pinned ? <Pin className="h-3.5 w-3.5 fill-current" /> : null}
                      {meta?.favorite ? <Star className="h-3.5 w-3.5 fill-current" /> : null}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-muted [overflow-wrap:anywhere]">{file.excerpt}</div>
                  {meta?.tags.length ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {meta.tags.map((tag) => (
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
