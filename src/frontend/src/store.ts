import { create } from "zustand";
import type { FileMeta, RepoSummary, SectionKey, SortMode } from "../../../types/domain";

export type ViewMode = "dashboard" | "manager" | "search";

interface AppState {
  summary: RepoSummary | null;
  section: SectionKey;
  view: ViewMode;
  files: FileMeta[];
  current: FileMeta | null;
  content: string;
  dirty: boolean;
  preview: boolean;
  status: string;
  statusError: boolean;
  query: string;
  sort: SortMode;
  searchResults: FileMeta[];
  setState: (patch: Partial<AppState>) => void;
  setStatus: (message: string, isError?: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  summary: null,
  section: "dashboard",
  view: "dashboard",
  files: [],
  current: null,
  content: "",
  dirty: false,
  preview: false,
  status: "就绪",
  statusError: false,
  query: "",
  sort: "updated",
  searchResults: [],
  setState: (patch) => set(patch),
  setStatus: (message, statusError = false) => set({ status: message, statusError })
}));
