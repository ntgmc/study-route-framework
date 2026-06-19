import CodeMirror from "@uiw/react-codemirror";
import { redo, undo } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import {
  ArrowUp,
  Archive,
  Bot,
  Columns2,
  Download,
  Eye,
  FilePlus2,
  Folder,
  FolderPen,
  GitCompare,
  Paperclip,
  PencilLine,
  Pin,
  Redo2,
  Save,
  Search,
  Settings,
  Star,
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
import { previewMarkdownContent } from "./markdownPreview";
import { useAppStore } from "./store";
import { Dashboard } from "./components/dashboard/Dashboard";
import { CreateDialog } from "./components/dialogs/CreateDialog";
import { DiffDialog } from "./components/dialogs/DiffDialog";
import { RenameDialog } from "./components/dialogs/RenameDialog";
import { MarkdownToolbar } from "./components/editor/MarkdownToolbar";
import { FileTree } from "./components/files/FileTree";
import { SearchView } from "./components/files/SearchView";
import { AppHeader } from "./components/layout/AppHeader";
import { AppSidebar } from "./components/layout/AppSidebar";
import { IconButton, SaveIndicator, ToastStack } from "./components/common";
import { insertEditorText, insertMarkdown, markdownSnippetCompletion, readAiSelection } from "./domain/editorCommands";
import { extractInlineTags, exportMarkdown, filterAndSortFilesByUiState, normalizeTags } from "./domain/fileSystem";
import { formatVersionTime, type EditorMode, type MarkdownAction, type SaveState } from "./domain/uiState";
import { useEditorScrollSync } from "./hooks/useEditorScrollSync";
import { useToasts } from "./hooks/useToasts";
import { useWorkspaceActions } from "./hooks/useWorkspaceActions";
import { Button, DialogShell } from "./ui";

const LazyAiDialog = lazy(() => import("./AiDialog"));
const LazyAiSettingsDialog = lazy(() => import("./AiSettingsDialog"));

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
  const [editorMountId, setEditorMountId] = useState(0);
  const editorViewRef = useRef<EditorView | null>(null);
  const autoSavingRef = useRef(false);
  const attachmentInputRef = useRef<HTMLInputElement | null>(null);
  const { toasts, showToast, requestConfirmation, requestToastAction, dismissToast } = useToasts();
  const {
    previewRef,
    showPreviewTop,
    setPreviewTopVisible,
    readEditorScrollProgress,
    readPreviewProgress,
    scheduleEditorSync,
    schedulePreviewSync,
    handlePreviewScroll,
    resetScrollProgress
  } = useEditorScrollSync({ editorMode, editorMountId, editorViewRef });

  const {
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
  } = useWorkspaceActions({
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
  });

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
  const visibleFiles = useMemo(() => filterAndSortFilesByUiState(files, tagFilter), [files, tagFilter]);

  return (
    <div className="grid h-screen grid-cols-[252px_minmax(0,1fr)] overflow-hidden bg-app text-ink max-[920px]:grid-cols-1 max-[920px]:grid-rows-[auto_minmax(0,1fr)]">
      <AppSidebar
        summary={summary}
        section={section}
        view={view}
        source={source}
        isDemoData={isDemoData}
        gitStatus={gitStatus}
        gitBusy={gitBusy}
        selectSection={selectSection}
        setStatus={setStatus}
        setAiSettingsOpen={setAiSettingsOpen}
        refreshGitStatus={refreshGitStatus}
        commitSnapshot={commitSnapshot}
      />

      <main className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
        <AppHeader
          view={view}
          activeInfo={activeInfo}
          searchResults={searchResults}
          source={source}
          runSearch={runSearch}
          setStatus={setStatus}
          onOpenAi={() => {
            setAiSelection(readAiSelection(editorViewRef.current));
            setAiOpen(true);
          }}
          onCreate={() => setCreateOpen(true)}
        />

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
                    <div data-testid="current-file-path" className="min-w-0 truncate text-sm text-muted">{current?.path || "未选择文件"}</div>
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
                    <Button data-testid="save-button" disabled={!current} variant="primary" onClick={() => saveCurrent().catch((error: Error) => setStatus(error.message, true))}>
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
                      <IconButton data-testid="editor-mode-edit" type="button" disabled={!current} active={editorMode === "edit"} title="编辑" onClick={() => setMode("edit")}>
                        <PencilLine className="h-4 w-4" />
                      </IconButton>
                      <IconButton data-testid="editor-mode-split" type="button" disabled={!current} active={editorMode === "split"} title="分屏预览" onClick={() => setMode("split")}>
                        <Columns2 className="h-4 w-4" />
                      </IconButton>
                      <IconButton data-testid="editor-mode-preview" type="button" disabled={!current} active={editorMode === "preview"} title="预览" onClick={() => setMode("preview")}>
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
                      data-testid="editor"
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
                      data-testid="markdown-preview"
                      className="markdown-preview h-full overflow-auto p-6"
                      onScroll={(event) => {
                        handlePreviewScroll(event.currentTarget);
                      }}
                    >
                      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                        {previewMarkdownContent(content)}
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
