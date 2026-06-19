import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import type { EditorMode } from "../domain/uiState";

interface UseEditorScrollSyncOptions {
  editorMode: EditorMode;
  editorMountId: number;
  editorViewRef: RefObject<EditorView | null>;
}

export function useEditorScrollSync({ editorMode, editorMountId, editorViewRef }: UseEditorScrollSyncOptions) {
  const previewRef = useRef<HTMLElement | null>(null);
  const editorLineProgressRef = useRef(0);
  const previewSyncFrameRef = useRef<number | null>(null);
  const editorSyncFrameRef = useRef<number | null>(null);
  const scrollSyncSourceRef = useRef<"editor" | "preview" | null>(null);
  const scrollSyncResetFrameRef = useRef<number | null>(null);
  const showPreviewTopRef = useRef(false);
  const [showPreviewTop, setShowPreviewTop] = useState(false);

  const resetScrollProgress = useCallback(() => {
    editorLineProgressRef.current = 0;
  }, []);

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
      syncEditorToProgress(editorViewRef.current, progress);
    },
    [editorMode, editorViewRef, readPreviewProgress, setPreviewTopVisible, syncEditorToProgress]
  );

  const scheduleEditorSync = useCallback(
    (progress = editorLineProgressRef.current) => {
      if (editorSyncFrameRef.current !== null) window.cancelAnimationFrame(editorSyncFrameRef.current);
      editorSyncFrameRef.current = window.requestAnimationFrame(() => {
        editorSyncFrameRef.current = null;
        if (editorViewRef.current) syncEditorToProgress(editorViewRef.current, progress);
      });
    },
    [editorViewRef, syncEditorToProgress]
  );

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
  }, [editorMode, editorMountId, editorViewRef, readEditorScrollProgress, syncPreviewToProgress]);

  return {
    previewRef,
    showPreviewTop,
    setPreviewTopVisible,
    readEditorScrollProgress,
    readPreviewProgress,
    scheduleEditorSync,
    schedulePreviewSync,
    handlePreviewScroll,
    resetScrollProgress
  };
}
