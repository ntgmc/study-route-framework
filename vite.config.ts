import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

function manualChunks(id: string) {
  if (!id.includes("node_modules")) return undefined;
  const normalized = id.replace(/\\/g, "/");
  if (normalized.includes("/@uiw/react-codemirror/")) return "editor-react";
  if (normalized.includes("/@codemirror/lang-markdown/") || normalized.includes("/@lezer/markdown/")) return "editor-markdown";
  if (normalized.includes("/@codemirror/state/") || normalized.includes("/@codemirror/view/") || normalized.includes("/@lezer/common/")) return "editor-core";
  if (normalized.includes("/@codemirror/")) return "editor-extensions";
  if (
    normalized.includes("/react-markdown/") ||
    normalized.includes("/remark-gfm/") ||
    normalized.includes("/rehype-sanitize/") ||
    normalized.includes("/unified/") ||
    normalized.includes("/micromark") ||
    normalized.includes("/mdast-") ||
    normalized.includes("/hast-") ||
    normalized.includes("/vfile")
  ) {
    return "markdown";
  }
  if (normalized.includes("/lucide-react/")) return "icons";
  if (normalized.includes("/react/") || normalized.includes("/react-dom/") || normalized.includes("/scheduler/") || normalized.includes("/zustand/")) return "react";
  return "vendor";
}

export default defineConfig({
  plugins: [react()],
  root: "src/frontend",
  build: {
    outDir: "../../dist/public",
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        manualChunks
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": "http://127.0.0.1:8765"
    }
  }
});
