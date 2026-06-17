import type React from "react";

export function Button(props: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "danger" | "plain" }) {
  const { className = "", variant = "plain", ...rest } = props;
  const variants = {
    primary: "bg-brand text-white hover:bg-teal-800",
    danger: "bg-red-50 text-red-700 hover:bg-red-100",
    plain: "bg-slate-100 text-ink hover:bg-slate-200"
  };
  return (
    <button
      {...rest}
      className={`inline-flex min-h-9 items-center justify-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`}
    />
  );
}

export function DialogShell({ title, children, onClose }: { title: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-slate-950/45 p-4">
      <section className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-lg bg-white p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold">{title}</h3>
          <Button onClick={onClose}>关闭</Button>
        </div>
        {children}
      </section>
    </div>
  );
}
