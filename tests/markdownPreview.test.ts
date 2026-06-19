import { describe, expect, it } from "vitest";
import { previewMarkdownContent, stripPreviewFrontMatter } from "../src/frontend/src/markdownPreview";

describe("markdown preview", () => {
  it("strips YAML front matter before rendering preview content", () => {
    const markdown = `---
id: review:2026-w25
type: review
schema_version: 2
title: 2026-W25
created: 2026-06-19
updated: 2026-06-19
tags: []
favorite: false
pinned: false
period: 2026-W25
---

# 学习复盘：2026-W25
`;

    expect(stripPreviewFrontMatter(markdown)).toBe("# 学习复盘：2026-W25\n");
  });

  it("keeps ordinary markdown that starts with a horizontal rule", () => {
    const markdown = `---

# Title

---
`;

    expect(stripPreviewFrontMatter(markdown)).toBe(markdown);
  });

  it("uses the empty preview message after stripping metadata-only content", () => {
    expect(previewMarkdownContent("---\ntitle: Empty\n---\n")).toBe("没有可预览内容");
  });
});
