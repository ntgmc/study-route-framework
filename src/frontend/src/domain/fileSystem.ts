import type { FileMeta } from "../../../../types/domain";
import type { FileMetaRecord } from "../drafts";

export function normalizeTags(value: string): string[] {
  return [...new Set(value.split(/[,\s，、#]+/).map((tag) => tag.trim()).filter(Boolean))].slice(0, 12);
}

export function extractInlineTags(text: string): string[] {
  return [...new Set(Array.from(text.matchAll(/(^|\s)#([\p{L}\p{N}_-]{2,24})/gu)).map((match) => match[2]))].slice(0, 12);
}

export function exportMarkdown(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename.endsWith(".md") ? filename : `${filename}.md`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function exportJson(filename: string, value: unknown) {
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

export function readMetadataRecords(value: unknown): FileMetaRecord[] {
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


export function filterAndSortFilesByUiState(files: FileMeta[], tagFilter: string): FileMeta[] {
  const filtered = tagFilter ? files.filter((file) => file.tags.includes(tagFilter)) : files;
  return [...filtered].sort((left, right) => {
    if (Boolean(left.pinned) !== Boolean(right.pinned)) return left.pinned ? -1 : 1;
    if (Boolean(left.favorite) !== Boolean(right.favorite)) return left.favorite ? -1 : 1;
    return 0;
  });
}
