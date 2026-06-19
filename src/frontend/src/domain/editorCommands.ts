import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";
import type { EditorView } from "@codemirror/view";
import type { AiSelectionRange } from "../../../../types/api";
import type { MarkdownAction } from "./uiState";

export const markdownSnippetCompletion = autocompletion({
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


export function insertMarkdown(view: EditorView, action: MarkdownAction) {
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

export function insertEditorText(view: EditorView, text: string) {
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

export function readAiSelection(view: EditorView | null): AiSelectionRange | undefined {
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
