import type React from "react";
import { AlertCircle, CheckCircle2, Loader2, X } from "lucide-react";
import type { SaveState, ToastMessage } from "../domain/uiState";
import { Button } from "../ui";

export function IconButton(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
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

export function SaveIndicator({ state }: { state: SaveState }) {
  const config = {
    saved: { label: "已保存", className: "bg-green-50 text-green-700", icon: CheckCircle2 },
    dirty: { label: "未保存", className: "bg-amber-50 text-amber-700", icon: AlertCircle },
    saving: { label: "保存中", className: "bg-blue-50 text-blue-700", icon: Loader2 }
  }[state];
  const Icon = config.icon;
  return (
    <span
      data-testid="save-state"
      data-save-state={state}
      className={`inline-flex min-h-8 items-center gap-1.5 rounded-full px-3 text-xs font-medium ${config.className}`}
    >
      <Icon className={`h-3.5 w-3.5 ${state === "saving" ? "animate-spin" : ""}`} />
      {config.label}
    </span>
  );
}

export function ToastStack({ toasts, onDismiss }: { toasts: ToastMessage[]; onDismiss: (toast: ToastMessage) => void }) {
  if (!toasts.length) return null;
  return (
    <div data-testid="toast-stack" className="fixed right-4 top-4 z-50 grid w-[min(420px,calc(100vw-2rem))] gap-2">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          data-testid="toast-message"
          className={`grid gap-3 rounded-lg border bg-white p-3 text-sm shadow-lg ${
            toast.kind === "error" ? "border-red-200 text-red-800" : toast.kind === "success" ? "border-green-200 text-green-800" : "border-slate-200 text-ink"
          }`}
        >
          <div className="flex items-start gap-2">
            {toast.kind === "error" ? <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
            <div className="min-w-0 flex-1 whitespace-pre-line [overflow-wrap:anywhere]">{toast.message}</div>
            <button type="button" className="grid h-6 w-6 shrink-0 place-items-center rounded hover:bg-slate-100" onClick={() => onDismiss(toast)} title="关闭">
              <X className="h-4 w-4" />
            </button>
          </div>
          {toast.actions?.length ? (
            <div className="flex flex-wrap justify-end gap-2">
              {toast.actions.map((action) => (
                <Button key={action.label} type="button" variant={action.variant} data-testid={action.testId} onClick={action.onClick}>
                  {action.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <div className="p-6 text-center text-sm text-muted">{text}</div>;
}

export function Panel({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
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

export function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (value: string) => void; type?: string }) {
  return (
    <label className="grid gap-1 text-sm text-muted">
      {label}
      <input className="min-h-10 rounded-md border border-line px-3 text-ink" type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}
