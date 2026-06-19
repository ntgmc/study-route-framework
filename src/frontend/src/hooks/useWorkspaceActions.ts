import { MutableRefObject, RefObject, useCallback, useEffect } from "react";
import type { EditorView } from "@codemirror/view";
import type { AiApplyMode, AiSelectionRange, GitStatusResponse } from "../../../../types/api";
import type { FileMeta, SectionKey, SortMode } from "../../../../types/domain";
import { client } from "../api";
import { clearDraft, getAllFileMeta, getDraft, getDraftVersions, getUiState, saveDraft, saveUiState, type DraftVersionRecord, type FileMetaRecord } from "../drafts";
import { insertEditorText, insertMarkdown } from "../domain/editorCommands";
import { exportMarkdown } from "../domain/fileSystem";
import { formatVersionTime, type EditorMode, type MarkdownAction, type SaveState, type ToastKind } from "../domain/uiState";
import { type AppState, useAppStore } from "../store";

interface ToastActionRequest {
  label: string;
  value: string;
  variant?: "primary" | "danger" | "plain";
}

interface ConfirmationOptions {
  confirmLabel?: string;
  cancelLabel?: string;
  kind?: ToastKind;
  confirmVariant?: "primary" | "danger" | "plain";
}

interface UseWorkspaceActionsOptions {
  current: FileMeta | null;
  content: string;
  dirty: boolean;
  status: string;
  statusError: boolean;
  section: SectionKey;
  query: string;
  sort: SortMode;
  editorMode: EditorMode;
  legacyMetaRecords: Record<string, FileMetaRecord>;
  pendingAiOperationId: string;
  editorViewRef: RefObject<EditorView | null>;
  previewRef: RefObject<HTMLElement | null>;
  autoSavingRef: MutableRefObject<boolean>;
  setState: (patch: Partial<AppState>) => void;
  setStatus: (message: string, isError?: boolean) => void;
  setEditorMode: React.Dispatch<React.SetStateAction<EditorMode>>;
  setDraftVersions: React.Dispatch<React.SetStateAction<DraftVersionRecord[]>>;
  setCompareVersion: React.Dispatch<React.SetStateAction<DraftVersionRecord | null>>;
  setLegacyMetaRecords: React.Dispatch<React.SetStateAction<Record<string, FileMetaRecord>>>;
  setCurrentMetaRecord: React.Dispatch<React.SetStateAction<FileMeta | null>>;
  setGitStatus: React.Dispatch<React.SetStateAction<GitStatusResponse | null>>;
  setGitBusy: React.Dispatch<React.SetStateAction<boolean>>;
  setTagInput: React.Dispatch<React.SetStateAction<string>>;
  setTagFilter: React.Dispatch<React.SetStateAction<string>>;
  setSaveState: React.Dispatch<React.SetStateAction<SaveState>>;
  setPendingAiOperationId: React.Dispatch<React.SetStateAction<string>>;
  requestConfirmation: (message: string, options?: ConfirmationOptions) => Promise<boolean>;
  requestToastAction: (message: string, actions: ToastActionRequest[], kind?: ToastKind) => Promise<string | undefined>;
  showToast: (message: string, kind?: ToastKind) => void;
  readEditorScrollProgress: (view: EditorView) => number;
  readPreviewProgress: (preview: HTMLElement) => number;
  scheduleEditorSync: (progress?: number) => void;
  schedulePreviewSync: (progress?: number) => void;
  resetScrollProgress: () => void;
}

export function useWorkspaceActions({
  current,
  content,
  dirty,
  status,
  statusError,
  section,
  query,
  sort,
  editorMode,
  legacyMetaRecords,
  pendingAiOperationId,
  editorViewRef,
  previewRef,
  autoSavingRef,
  setState,
  setStatus,
  setEditorMode,
  setDraftVersions,
  setCompareVersion,
  setLegacyMetaRecords,
  setCurrentMetaRecord,
  setGitStatus,
  setGitBusy,
  setTagInput,
  setTagFilter,
  setSaveState,
  setPendingAiOperationId,
  requestConfirmation,
  requestToastAction,
  showToast,
  readEditorScrollProgress,
  readPreviewProgress,
  scheduleEditorSync,
  schedulePreviewSync,
  resetScrollProgress
}: UseWorkspaceActionsOptions) {
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
      resetScrollProgress();
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
      resetScrollProgress();
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


  return {
    confirmBeforeLeavingDirtyFile,
    reportStatus,
    loadDraftVersions,
    loadFileMetaRecords,
    refreshSummary,
    refreshGitStatus,
    loadFiles,
    openFile,
    selectSection,
    openMeta,
    setMode,
    applyMarkdownAction,
    updateCurrentMeta,
    runEditorCommand,
    restoreDraftVersion,
    exportSelectedDraft,
    migrateLegacyMetadata,
    commitSnapshot,
    uploadAttachment,
    applyAiResult,
    saveCurrent,
    archiveCurrent,
    runSearch
  };
}
