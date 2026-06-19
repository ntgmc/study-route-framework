import { describe, expect, it } from "vitest";
import {
  parseFrontMatter,
  parseMarkdownDocument,
  replaceFrontMatter,
  tableRows,
  taskItems
} from "../src/backend/markdownParser.js";

describe("markdown parser", () => {
  it("parses and writes flat front matter", () => {
    const parsed = parseFrontMatter("---\nid: plan:demo\nschema_version: 1\ntags: [ts, api]\n---\n# Demo\n");
    expect(parsed?.data).toMatchObject({ id: "plan:demo", schema_version: 1, tags: ["ts", "api"] });

    const next = replaceFrontMatter("# Demo\n", {
      id: "plan:demo",
      type: "plan",
      schema_version: 1,
      title: "Demo",
      tags: []
    });
    expect(next).toContain("id: plan:demo");
    expect(next).toContain("tags: []");
    expect(next).toContain("# Demo");
  });

  it("keeps missing front matter compatible and reports damaged front matter", () => {
    expect(parseMarkdownDocument("# Demo\n").frontMatter).toEqual({});
    const damaged = parseMarkdownDocument("---\nid: bad\n# Demo\n");
    expect(damaged.frontMatterError).toContain("closing");
  });

  it("parses tables with escaped pipes and source lines", () => {
    const rows = tableRows(
      `# Demo

## Tasks

| Name | Result |
| --- | --- |
| A\\|B | Done |
`,
      "Tasks"
    );
    expect(rows).toEqual([{ cells: ["A|B", "Done"], line: 7 }]);
  });

  it("parses checked and unchecked task lists", () => {
    const items = taskItems(
      `# Demo

## Todo

- [ ] Open
- [x] Closed
- Plain bullet
`,
      "Todo"
    );
    expect(items).toEqual([
      { text: "Open", checked: false, line: 5 },
      { text: "Closed", checked: true, line: 6 },
      { text: "Plain bullet", checked: false, line: 7 }
    ]);
  });
});
