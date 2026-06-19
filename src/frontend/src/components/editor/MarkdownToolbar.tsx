import type React from "react";
import { Bold, Code2, Image, Italic, Link, List, Quote, Table2 } from "lucide-react";
import type { MarkdownAction } from "../../domain/uiState";
import { IconButton } from "../common";

export function MarkdownToolbar({ disabled, onAction }: { disabled: boolean; onAction: (action: MarkdownAction) => void }) {
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
