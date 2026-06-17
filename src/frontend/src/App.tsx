import CodeMirror from "@uiw/react-codemirror";
import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";
import { markdown } from "@codemirror/lang-markdown";
import {
  Archive,
  Bold,
  Bot,
  Check,
  Code2,
  Columns2,
  Eye,
  FilePlus2,
  FolderPen,
  Image,
  Italic,
  Link,
  List,
  PencilLine,
  Quote,
  Save,
  Search,
  Sparkles,
  Table2
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import rehypeSanitize from "rehype-sanitize";
import remarkGfm from "remark-gfm";
import type { EditorView } from "@codemirror/view";
import type { FileMeta, RepoSummary, SectionKey } from "../../../types/domain";
import { client } from "./api";
import { clearDraft, getDraft, getDraftVersions, getUiState, saveDraft, saveUiState, type DraftVersionRecord } from "./drafts";
import { useAppStore } from "./store";

type EditorMode = "edit" | "split" | "preview";
type MarkdownAction = "bold" | "italic" | "list" | "table" | "code" | "link" | "image" | "quote";

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

function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "danger" | "plain" }) {
  const { className = "", variant = "plain", ...rest } = props;
  const variants = {
    primary: "bg-brand text-white hover:bg-teal-800",
    danger: "bg-red-50 text-red-700 hover:bg-red-100",
    plain: "bg-slate-100 text-ink hover:bg-slate-200"
  };
  return (
    <button
      {...rest}
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    />
  );
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

function DialogShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/45 p-4">
      <section className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">{title}</h3>
          <Button onClick={onClose}>关闭</Button>
        </div>
        {children}
      </section>
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
  const editorViewRef = useRef<EditorView | null>(null);
  const autoSavingRef = useRef(false);

  const setMode = useCallback(
    (mode: EditorMode) => {
      setEditorMode(mode);
      setState({ preview: mode === "preview" });
    },
    [setState]
  );

  const loadDraftVersions = useCallback(async (path: string) => {
    const versions = await getDraftVersions(path).catch(() => []);
    setDraftVersions(versions);
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
      const draft = await getDraft(path).catch(() => undefined);
      if (draft && draft.content !== result.content && window.confirm("检测到本地草稿，是否恢复到编辑器？")) {
        nextContent = draft.content;
        nextDirty = true;
      }
      setState({
        current: result.meta,
        content: nextContent,
        dirty: nextDirty,
        preview: false,
        view: "manager"
      });
      setEditorMode("edit");
      await loadDraftVersions(result.meta.path);
      await saveUiState(result.meta.section, result.meta.path).catch(() => undefined);
      setStatus(`已打开 ${result.meta.path}`);
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
      setDraftVersions([]);
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
    await refreshSummary();
    const saved = await getUiState().catch(() => undefined);
    if (saved?.section && saved.section !== "dashboard") {
      await selectSection(saved.section as SectionKey);
      if (saved.path) await openFile(saved.path);
    } else {
      await selectSection("dashboard");
    }
  }, [openFile, refreshSummary, selectSection]);

  useEffect(() => {
    init().catch((error: Error) => setStatus(error.message, true));
  }, [init, setStatus]);

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
            await loadDraftVersions(path);
          }
          await refreshSummary();
          await loadFiles();
          setStatus(`已自动保存 ${result.meta.path}`);
        })
        .catch((error: Error) => setStatus(`自动保存失败：${error.message}`, true))
        .finally(() => {
          autoSavingRef.current = false;
        });
    }, 30000);
    return () => window.clearInterval(timer);
  }, [loadDraftVersions, loadFiles, refreshSummary, setState, setStatus]);

  async function saveCurrent() {
    if (!current) return;
    const result = await client.saveFile({ path: current.path, content });
    await clearDraft(current.path).catch(() => undefined);
    setState({ current: result.meta, dirty: false });
    await loadDraftVersions(result.meta.path);
    await refreshSummary();
    await loadFiles();
    setStatus(`已保存 ${result.meta.path}${result.backup ? `，备份：${result.backup}` : ""}`);
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

  return (
    <div className="grid min-h-screen grid-cols-[252px_minmax(0,1fr)] bg-app text-ink max-[920px]:grid-cols-1">
      <aside className="bg-slate-900 p-4 text-slate-100">
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

      <main className="grid min-w-0 grid-rows-[auto_minmax(0,1fr)]">
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
          <section className="grid min-h-0 grid-cols-[minmax(280px,380px)_minmax(0,1fr)] max-[920px]:grid-cols-1 max-[920px]:grid-rows-[minmax(190px,34vh)_minmax(460px,1fr)]">
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
              <FileList files={files} current={current} onOpen={openFile} />
            </aside>
            <section className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] bg-white">
              <div className="grid gap-2 border-b border-line px-4 py-2">
                <div className="flex min-h-10 items-center justify-between gap-3">
                  <div className="min-w-0 truncate text-sm text-muted">{current?.path || "未选择文件"}</div>
                  <div className="flex flex-wrap justify-end gap-2">
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
                    <select
                      className="min-h-9 max-w-[220px] rounded-md border border-line bg-white px-2 text-sm disabled:opacity-50"
                      disabled={!current || draftVersions.length === 0}
                      value=""
                      title="草稿版本"
                      onChange={(event) => {
                        const version = draftVersions.find((item) => item.id === event.target.value);
                        if (!version || !current) return;
                        if (!window.confirm("恢复这个本地草稿版本到编辑器？")) return;
                        setState({ content: version.content, dirty: true });
                        setStatus(`已恢复 ${new Date(version.updatedAt).toLocaleString()} 的草稿`);
                      }}
                    >
                      <option value="">草稿版本</option>
                      {draftVersions.map((version) => (
                        <option key={version.id} value={version.id}>
                          {new Date(version.updatedAt).toLocaleString()}
                        </option>
                      ))}
                    </select>
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
              </div>
              <div className={`min-h-0 overflow-hidden ${editorMode === "split" ? "grid grid-cols-2 max-[920px]:grid-cols-1 max-[920px]:grid-rows-2" : ""}`}>
                {editorMode !== "preview" ? (
                  <CodeMirror
                    value={content}
                    height="100%"
                    minHeight="100%"
                    extensions={[markdown(), markdownSnippetCompletion]}
                    editable={Boolean(current)}
                    basicSetup={{ lineNumbers: true, foldGutter: true }}
                    onCreateEditor={(view) => {
                      editorViewRef.current = view;
                    }}
                    onChange={(value) => {
                      setState({ content: value, dirty: true });
                      if (current) setStatus(`正在编辑 ${current.path}`);
                    }}
                    className="h-full text-sm"
                  />
                ) : null}
                {editorMode !== "edit" ? (
                  <article className={`markdown-preview h-full overflow-auto p-6 ${editorMode === "split" ? "border-l border-line max-[920px]:border-l-0 max-[920px]:border-t" : ""}`}>
                    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
                      {content || "没有可预览内容"}
                    </ReactMarkdown>
                  </article>
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
      {aiOpen ? <AiDialog section={section} current={current} content={content} onClose={() => setAiOpen(false)} onApply={(next, replace) => {
        const separator = content.endsWith("\n") || !content ? "" : "\n\n";
        setState({ content: replace ? `${next.trim()}\n` : `${content}${separator}${next.trim()}\n`, dirty: true });
        setStatus("AI 生成内容已写入编辑器，保存后才会更新文件");
      }} /> : null}
    </div>
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

function FileList({ files, current, onOpen }: { files: FileMeta[]; current: FileMeta | null; onOpen: (path: string) => Promise<void> }) {
  const setStatus = useAppStore((state) => state.setStatus);
  if (!files.length) return <div className="rounded-lg border border-dashed border-line p-6 text-center text-sm text-muted">当前分类没有 Markdown 文件</div>;
  return (
    <div className="grid gap-2">
      {files.map((file) => (
        <button
          key={file.path}
          type="button"
          onClick={() => onOpen(file.path).catch((error: Error) => setStatus(error.message, true))}
          className={`min-h-[74px] rounded-lg border bg-white p-3 text-left hover:border-brand hover:shadow-[0_0_0_3px_rgba(15,118,110,.18)] ${current?.path === file.path ? "border-brand shadow-[0_0_0_3px_rgba(15,118,110,.18)]" : "border-line"}`}
        >
          <div className="font-semibold [overflow-wrap:anywhere]">{file.title}</div>
          <div className="text-xs text-muted [overflow-wrap:anywhere]">{file.path} · {file.updated} · {file.size} B</div>
          <div className="text-xs text-muted [overflow-wrap:anywhere]">{file.excerpt}</div>
        </button>
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

function AiDialog({ section, current, content, onClose, onApply }: { section: SectionKey; current: FileMeta | null; content: string; onClose: () => void; onApply: (content: string, replace: boolean) => void }) {
  const setStatus = useAppStore((state) => state.setStatus);
  const [status, setAiStatus] = useState("检测中");
  const [configured, setConfigured] = useState(false);
  const [mode, setMode] = useState("doc");
  const [prompt, setPrompt] = useState("");
  const [useContext, setUseContext] = useState(true);
  const [result, setResult] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    client.aiStatus().then((info) => {
      setConfigured(info.configured);
      setAiStatus(info.configured ? `${info.model} 已配置` : `未配置 ${info.required_env}`);
    }).catch((error: Error) => setAiStatus(error.message));
  }, []);

  async function generate() {
    setBusy(true);
    try {
      const response = await client.aiGenerate({
        mode,
        prompt,
        section,
        path: current?.path || "",
        context: useContext ? content : ""
      });
      setResult(response.content);
      setStatus(`DeepSeek 生成完成：${response.model}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogShell title="DeepSeek 生成" onClose={onClose}>
      <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); generate().catch((error: Error) => setStatus(error.message, true)); }}>
        <div className={`w-fit rounded-full px-3 py-1 text-xs ${configured ? "bg-green-100 text-green-800" : "bg-amber-100 text-amber-800"}`}>{status}</div>
        <label className="grid gap-1 text-sm text-muted">生成类型<select className="min-h-10 rounded-md border border-line px-3 text-ink" value={mode} onChange={(event) => setMode(event.target.value)}><option value="doc">完整文档</option><option value="plan">学习计划</option><option value="log">学习日志</option><option value="review">复盘总结</option><option value="tasks">任务拆解</option><option value="polish">润色当前文档</option></select></label>
        <label className="grid gap-1 text-sm text-muted">生成要求<textarea className="min-h-28 rounded-md border border-line p-3 text-ink" value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label>
        <label className="flex items-center gap-2 text-sm text-muted"><input type="checkbox" checked={useContext} onChange={(event) => setUseContext(event.target.checked)} />带入当前编辑器内容作为上下文</label>
        <label className="grid gap-1 text-sm text-muted">生成结果<textarea className="min-h-48 rounded-md border border-line p-3 font-mono text-sm text-ink" value={result} onChange={(event) => setResult(event.target.value)} /></label>
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" onClick={onClose}>关闭</Button>
          <Button type="submit" variant="primary" disabled={!configured || busy}><Sparkles className="h-4 w-4" />{busy ? "生成中" : "生成"}</Button>
          <Button type="button" disabled={!result} onClick={() => onApply(result, false)}>插入编辑器</Button>
          <Button type="button" variant="danger" disabled={!result} onClick={() => window.confirm("确定用 AI 生成结果替换当前编辑器内容吗？") && onApply(result, true)}>替换编辑器</Button>
        </div>
      </form>
    </DialogShell>
  );
}
