export function stripPreviewFrontMatter(markdown: string): string {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/);
  if (!match) return markdown;

  const hasYamlMetadata = match[1]
    .split(/\r?\n/)
    .some((line) => /^[A-Za-z0-9_-]+:\s*/.test(line.trim()));

  return hasYamlMetadata ? markdown.slice(match[0].length).replace(/^\r?\n/, "") : markdown;
}

export function previewMarkdownContent(markdown: string): string {
  return stripPreviewFrontMatter(markdown).trim() || "没有可预览内容";
}
