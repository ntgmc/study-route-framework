import { useEffect, useMemo, useState } from "react";
import type { AiActionId, AiPromptTemplate, AiProviderId, AiSettingsResponse, AiWorkspaceSettings } from "../../../types/api";
import { client } from "./api";
import { useAppStore } from "./store";
import { Button, DialogShell } from "./ui";

function numberValue(value: string, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function templateId(): string {
  return `template_${Date.now().toString(36)}`;
}

export function AiSettingsDialog({ onClose, onSaved }: { onClose: () => void; onSaved?: () => void }) {
  const setStatus = useAppStore((state) => state.setStatus);
  const [info, setInfo] = useState<AiSettingsResponse | null>(null);
  const [settings, setSettings] = useState<AiWorkspaceSettings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    client
      .aiSettings()
      .then((response) => {
        setInfo(response);
        setSettings(response.settings);
      })
      .catch((error: Error) => setStatus(error.message, true));
  }, [setStatus]);

  const provider = useMemo(() => info?.providers.find((item) => item.id === settings?.provider), [info, settings?.provider]);
  const overrides = new Set(info?.env_overrides ?? []);

  async function save() {
    if (!settings) return;
    setBusy(true);
    try {
      const response = await client.saveAiSettings(settings);
      setInfo(response);
      setSettings(response.settings);
      setStatus("AI 配置已保存到当前数据目录");
      onSaved?.();
    } finally {
      setBusy(false);
    }
  }

  function patch(value: Partial<AiWorkspaceSettings>) {
    setSettings((current) => (current ? { ...current, ...value } : current));
  }

  function patchTemplate(id: string, patchValue: Partial<AiPromptTemplate>) {
    patch({
      promptTemplates: (settings?.promptTemplates ?? []).map((item) => (item.id === id ? { ...item, ...patchValue } : item))
    });
  }

  function addTemplate() {
    const actionId = info?.actions[0]?.id ?? "custom";
    patch({
      promptTemplates: [
        ...(settings?.promptTemplates ?? []),
        { id: templateId(), name: "新 Prompt 模板", actionId, prompt: "", enabled: true }
      ]
    });
  }

  function removeTemplate(id: string) {
    patch({ promptTemplates: (settings?.promptTemplates ?? []).filter((item) => item.id !== id) });
  }

  return (
    <DialogShell title="AI Provider 配置" onClose={onClose}>
      {!settings || !info ? (
        <div className="p-4 text-sm text-muted">加载中</div>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            save().catch((error: Error) => setStatus(error.message, true));
          }}
        >
          <label className="flex items-center gap-2 text-sm text-ink">
            <input type="checkbox" checked={settings.enabled} onChange={(event) => patch({ enabled: event.target.checked })} />
            启用当前数据目录的 AI
          </label>

          <label className="grid gap-1 text-sm text-muted">
            Provider
            <select
              className="min-h-10 rounded-md border border-line px-3 text-ink disabled:bg-slate-100"
              value={settings.provider}
              disabled={overrides.has("provider")}
              onChange={(event) => {
                const next = info.providers.find((item) => item.id === event.target.value);
                if (!next) return;
                patch({
                  provider: next.id as AiProviderId,
                  baseUrl: next.default_base_url,
                  model: next.default_model
                });
              }}
            >
              {info.providers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
            {overrides.has("provider") ? <span className="text-xs text-amber-700">环境变量 LLM_PROVIDER 正在覆盖此字段</span> : null}
          </label>

          <div className="grid grid-cols-2 gap-3 max-[720px]:grid-cols-1">
            <label className="grid gap-1 text-sm text-muted">
              Base URL
              <input
                className="min-h-10 rounded-md border border-line px-3 text-ink disabled:bg-slate-100"
                value={settings.baseUrl}
                disabled={overrides.has("baseUrl")}
                onChange={(event) => patch({ baseUrl: event.target.value })}
              />
              {overrides.has("baseUrl") ? <span className="text-xs text-amber-700">环境变量正在覆盖 Base URL</span> : null}
            </label>
            <label className="grid gap-1 text-sm text-muted">
              Model
              <input
                className="min-h-10 rounded-md border border-line px-3 text-ink disabled:bg-slate-100"
                value={settings.model}
                disabled={overrides.has("model")}
                onChange={(event) => patch({ model: event.target.value })}
              />
              {overrides.has("model") ? <span className="text-xs text-amber-700">环境变量正在覆盖 Model</span> : null}
            </label>
          </div>

          <div className="grid grid-cols-3 gap-3 max-[720px]:grid-cols-1">
            <label className="grid gap-1 text-sm text-muted">
              Timeout
              <input className="min-h-10 rounded-md border border-line px-3 text-ink disabled:bg-slate-100" type="number" min="1" max="600" value={settings.timeout} disabled={overrides.has("timeout")} onChange={(event) => patch({ timeout: numberValue(event.target.value, settings.timeout) })} />
            </label>
            <label className="grid gap-1 text-sm text-muted">
              Max Tokens
              <input className="min-h-10 rounded-md border border-line px-3 text-ink disabled:bg-slate-100" type="number" min="1" max="64000" value={settings.maxTokens} disabled={overrides.has("maxTokens")} onChange={(event) => patch({ maxTokens: numberValue(event.target.value, settings.maxTokens) })} />
            </label>
            <label className="grid gap-1 text-sm text-muted">
              Temperature
              <input className="min-h-10 rounded-md border border-line px-3 text-ink disabled:bg-slate-100" type="number" min="0" max="2" step="0.1" value={settings.temperature} disabled={overrides.has("temperature")} onChange={(event) => patch({ temperature: numberValue(event.target.value, settings.temperature) })} />
            </label>
          </div>

          <section className="rounded-md border border-line bg-slate-50 p-3 text-sm">
            <div className="font-medium text-ink">API Key</div>
            <div className="mt-1 text-muted">
              {provider?.local_provider ? "本地 provider 不要求 API Key；如需鉴权，仍通过环境变量提供。" : `远程 provider 需要环境变量：${info.required_key_env}`}
            </div>
            <div className={info.api_key_detected ? "mt-2 text-green-700" : "mt-2 text-amber-700"}>
              {info.api_key_detected ? "已检测到环境变量" : "未检测到环境变量"}
            </div>
          </section>

          <label className="grid gap-1 text-sm text-muted">
            工作区 Prompt 约束
            <textarea
              className="min-h-24 rounded-md border border-line p-3 text-ink"
              maxLength={4000}
              value={settings.workspacePrompt}
              onChange={(event) => patch({ workspacePrompt: event.target.value })}
            />
            <span className="text-xs">随当前数据目录保存，只参与请求内容，不影响 provider 配置。</span>
          </label>

          <section className="grid gap-3 rounded-md border border-line bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium text-ink">Prompt 模板</div>
                <div className="text-xs text-muted">模板只保存非密钥文本，可绑定到学习执行类 AI 动作。</div>
              </div>
              <Button type="button" onClick={addTemplate}>新增模板</Button>
            </div>
            {(settings.promptTemplates ?? []).length ? (
              <div className="grid gap-3">
                {settings.promptTemplates.map((template) => (
                  <div key={template.id} className="grid gap-2 rounded-md border border-line bg-white p-3">
                    <div className="grid grid-cols-[minmax(0,1fr)_220px_auto] gap-2 max-[720px]:grid-cols-1">
                      <input
                        className="min-h-10 rounded-md border border-line px-3 text-ink"
                        value={template.name}
                        maxLength={80}
                        onChange={(event) => patchTemplate(template.id, { name: event.target.value })}
                      />
                      <select
                        className="min-h-10 rounded-md border border-line px-3 text-ink"
                        value={template.actionId}
                        onChange={(event) => patchTemplate(template.id, { actionId: event.target.value as AiActionId })}
                      >
                        {info.actions.map((action) => (
                          <option key={action.id} value={action.id}>{action.label}</option>
                        ))}
                      </select>
                      <label className="flex items-center gap-2 text-sm text-muted">
                        <input type="checkbox" checked={template.enabled} onChange={(event) => patchTemplate(template.id, { enabled: event.target.checked })} />
                        启用
                      </label>
                    </div>
                    <textarea
                      className="min-h-20 rounded-md border border-line p-3 text-ink"
                      maxLength={4000}
                      value={template.prompt}
                      onChange={(event) => patchTemplate(template.id, { prompt: event.target.value })}
                    />
                    <div className="flex justify-end">
                      <Button type="button" variant="danger" onClick={() => removeTemplate(template.id)}>删除模板</Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted">暂无自定义 Prompt 模板。</div>
            )}
          </section>

          {info.env_overrides.length ? (
            <div className="rounded-md bg-amber-50 p-3 text-sm text-amber-800">环境变量正在覆盖：{info.env_overrides.join(", ")}。保存的数据目录配置会保留，但当前不会全部生效。</div>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" onClick={onClose}>
              取消
            </Button>
            <Button type="submit" variant="primary" disabled={busy}>
              {busy ? "保存中" : "保存配置"}
            </Button>
          </div>
        </form>
      )}
    </DialogShell>
  );
}

export default AiSettingsDialog;
