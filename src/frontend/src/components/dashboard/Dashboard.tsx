import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Eye, FilePlus2, GitCompare } from "lucide-react";
import type { ExecutionAdjustmentSuggestion, FileMeta, RepoSummary } from "../../../../../types/domain";
import { client } from "../../api";
import { createInitialDailyLog, createInitialFocus } from "../../domain/learningModel";
import { useAppStore } from "../../store";
import { Button } from "../../ui";
import { EmptyState, Input, Panel } from "../common";
import { RecentList } from "../files/RecentList";

export function Dashboard({ summary, onOpen, onRefresh }: { summary: RepoSummary; onOpen: (file: FileMeta) => Promise<void>; onRefresh: () => Promise<void> }) {
  const setStatus = useAppStore((state) => state.setStatus);
  const execution = summary.execution;
  const maintenanceRef = useRef<HTMLDetailsElement | null>(null);
  const focusPanelRef = useRef<HTMLDivElement | null>(null);
  const [focus, setFocus] = useState(() => createInitialFocus(summary.focus));
  const [log, setLog] = useState(() => createInitialDailyLog(summary.today));

  useEffect(() => {
    setFocus(createInitialFocus(summary.focus));
    setLog((current) => ({ ...current, date: summary.today }));
  }, [summary]);

  async function saveFocus() {
    await client.saveFocus(focus);
    await onRefresh();
    setStatus("dashboard 焦点已更新");
  }

  async function appendLog() {
    const result = await client.appendLog(log);
    setLog({ date: summary.today, task: "", result: "", hours: "", evidence: "", takeaway: "", next: "" });
    await onRefresh();
    setStatus(`已追加日志 ${result.path}`);
  }

  async function createPlanFromRoute() {
    const route = execution.routeProgress[0]?.route;
    if (!route) throw new Error("当前没有可用于生成周计划的路线");
    const result = await client.createPlanFromRoute({ routePath: route.path, week: execution.week });
    await onRefresh();
    await onOpen(result.meta);
    setStatus(result.existed ? `已打开现有周计划 ${result.path}` : `已生成周计划 ${result.path}`);
  }

  async function createLogFromPlan() {
    const plan = execution.activePlan;
    if (!plan) throw new Error("当前没有可用于生成今日日志的周计划");
    const result = await client.createLogFromPlan({ planPath: plan.path, date: summary.today });
    await onRefresh();
    await onOpen(result.meta);
    setStatus(result.existed ? `已打开今日日志 ${result.path}` : `已生成今日日志 ${result.path}`);
  }

  async function createReviewFromPlan(planPath = execution.activePlan?.path) {
    if (!planPath) throw new Error("当前没有可用于生成周复盘的计划");
    const result = await client.createReviewFromPlan({ planPath, week: execution.week });
    await onRefresh();
    await onOpen(result.meta);
    setStatus(result.existed ? `已打开现有周复盘 ${result.path}` : `已生成周复盘 ${result.path}`);
  }

  async function applySuggestion(suggestion: ExecutionAdjustmentSuggestion) {
    const routePath = suggestion.routePath || execution.routeProgress[0]?.route.path;
    if (!routePath) throw new Error("当前没有可应用调整建议的路线");
    const result = await client.applyRouteAdjustment({
      routePath,
      suggestion: suggestion.action,
      reason: suggestion.reason,
      date: summary.today
    });
    await onRefresh();
    await onOpen(result.meta);
    setStatus(`已追加路线调整 ${result.path}`);
  }

  const openSource = useCallback(
    async (file: FileMeta) => {
      if (file.section === "dashboard") {
        if (maintenanceRef.current) maintenanceRef.current.open = true;
        window.requestAnimationFrame(() => {
          focusPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
        setStatus("已定位到 dashboard 当前焦点");
        return;
      }
      await onOpen(file);
    },
    [onOpen, setStatus]
  );

  const nextAction = useMemo(() => {
    if (execution.pendingReviews.length) {
      const item = execution.pendingReviews[0];
      return {
        title: "补齐周复盘",
        detail: `${item.plan.title} 还没写复盘。先记一下这周做完了什么、哪里卡住了、下周怎么改。`,
        label: "生成复盘",
        run: () => createReviewFromPlan(item.plan.path)
      };
    }
    if (!execution.todayTasks.length && execution.activePlan) {
      return {
        title: "生成今日日志",
        detail: "已经有周计划了，先开一篇今日日志，把今天要做的事写进去。",
        label: "生成今日日志",
        run: createLogFromPlan
      };
    }
    if (!execution.activePlan && execution.routeProgress.length) {
      return {
        title: "生成本周计划",
        detail: "路线里已经有当前阶段了，下一步是挑出这周真正要做的几件事。",
        label: "生成周计划",
        run: createPlanFromRoute
      };
    }
    if (execution.suggestions.length) {
      const suggestion = execution.suggestions[0];
      return {
        title: "处理路线调整",
        detail: suggestion.reason,
        label: "应用建议",
        run: () => applySuggestion(suggestion)
      };
    }
    return {
      title: execution.todayTasks[0]?.title || "继续推进今日任务",
      detail: execution.todayTasks[0] ? `${execution.todayTasks[0].status} · ${execution.todayTasks[0].source.path}` : "现在没有明显缺口，继续做今天的任务就行。",
      label: execution.todayTasks[0] ? "打开任务来源" : "刷新状态",
      run: () => execution.todayTasks[0] ? openSource(execution.todayTasks[0].source) : onRefresh()
    };
  }, [execution, onRefresh, openSource]);

  const flowSteps = [
    { label: "目标", state: focus.main_goal ? "done" : "empty", detail: focus.main_goal || "未填写" },
    { label: "路线", state: execution.routeProgress.length ? "done" : "empty", detail: execution.routeProgress[0]?.currentTheme || "未识别" },
    { label: "周计划", state: execution.activePlan ? "done" : "empty", detail: execution.activePlan?.title || "未生成" },
    { label: "今日日志", state: execution.todayTasks.length ? "active" : "empty", detail: `${execution.todayTasks.length} 个任务` },
    { label: "复盘", state: execution.pendingReviews.length ? "active" : "done", detail: execution.pendingReviews.length ? `${execution.pendingReviews.length} 个待复盘` : "无待处理" },
    { label: "调整", state: execution.suggestions.length ? "active" : "done", detail: execution.suggestions.length ? `${execution.suggestions.length} 条建议` : "无建议" }
  ] as const;

  return (
    <section className="overflow-auto p-5">
      <div className="mb-4 grid grid-cols-[minmax(0,1fr)_320px] gap-4 max-[1040px]:grid-cols-1">
        <section className="rounded-lg border border-line bg-white p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted">下一步</div>
              <h2 className="mt-1 text-xl font-semibold [overflow-wrap:anywhere]">{nextAction.title}</h2>
              <p className="mt-1 text-sm text-muted [overflow-wrap:anywhere]">{nextAction.detail}</p>
            </div>
            <Button variant="primary" onClick={() => nextAction.run().catch((error: Error) => setStatus(error.message, true))}>
              <Check className="h-4 w-4" />
              {nextAction.label}
            </Button>
          </div>
          <div className="grid grid-cols-6 gap-2 max-[820px]:grid-cols-3 max-[520px]:grid-cols-2">
            {flowSteps.map((step, index) => (
              <div key={step.label} className={`min-h-24 rounded-md border p-3 ${step.state === "active" ? "border-brand bg-teal-50" : step.state === "done" ? "border-green-200 bg-green-50" : "border-line bg-slate-50"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-muted">{String(index + 1).padStart(2, "0")}</span>
                  <span className={`h-2.5 w-2.5 rounded-full ${step.state === "active" ? "bg-brand" : step.state === "done" ? "bg-green-600" : "bg-slate-300"}`} />
                </div>
                <div className="mt-2 font-semibold">{step.label}</div>
                <div className="mt-1 line-clamp-2 text-xs text-muted [overflow-wrap:anywhere]">{step.detail}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-lg border border-line bg-white p-4">
          <h3 className="font-semibold">执行状态</h3>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {[
              ["今日", execution.todayTasks.length],
              ["未完", execution.unfinishedTasks.length],
              ["阻塞", execution.blockers.length],
              ["复盘", execution.pendingReviews.length]
            ].map(([label, value]) => (
              <div key={label} className="rounded-md bg-slate-50 p-3">
                <strong className="block text-2xl leading-tight">{value}</strong>
                <span className="text-xs text-muted">{label}</span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="mb-4 grid grid-cols-[minmax(0,1fr)_360px] gap-4 max-[1100px]:grid-cols-1">
        <div className="grid gap-4">
          <Panel
            title="执行"
            action={<Button variant="primary" onClick={() => createLogFromPlan().catch((error: Error) => setStatus(error.message, true))}><FilePlus2 className="h-4 w-4" />生成今日日志</Button>}
          >
            {execution.todayTasks.length ? (
              <div className="grid gap-2 p-3">
                {execution.todayTasks.map((task) => (
                  <div key={task.id} className="rounded-lg border border-line bg-white p-3">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold [overflow-wrap:anywhere]">{task.title}</div>
                        <div className="mt-1 text-xs text-muted [overflow-wrap:anywhere]">
                          {task.status} · {task.sourceDetail}{task.dueDate ? ` · ${task.dueDate}` : ""}{task.output ? ` · ${task.output}` : ""}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <PriorityBadge value={task.priority} />
                        <Button type="button" onClick={() => openSource(task.source).catch((error: Error) => setStatus(error.message, true))}>
                          <Eye className="h-4 w-4" />
                          打开
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState text="今天还没有明确任务。" />
            )}
          </Panel>

          <Panel
            title="路线与计划"
            action={<Button onClick={() => createPlanFromRoute().catch((error: Error) => setStatus(error.message, true))}><GitCompare className="h-4 w-4" />生成周计划</Button>}
          >
            <div className="grid grid-cols-2 gap-3 p-3 max-[820px]:grid-cols-1">
              <div className="grid gap-2">
                <h4 className="text-sm font-semibold text-muted">当前路线</h4>
                {execution.routeProgress.length ? execution.routeProgress.map((route) => (
                  <button key={route.route.path} type="button" className="rounded-lg border border-line bg-white p-3 text-left hover:border-brand" onClick={() => openSource(route.route).catch((error: Error) => setStatus(error.message, true))}>
                    <div className="font-semibold [overflow-wrap:anywhere]">{route.currentTheme || route.route.title}</div>
                    <div className="mt-1 text-xs text-muted [overflow-wrap:anywhere]">阶段 {route.currentStage || "未标记"} · {route.status} · {route.keyTask || "未填写任务"}</div>
                  </button>
                )) : <EmptyState text="没有识别到路线阶段。" />}
              </div>
              <div className="grid gap-2">
                <h4 className="text-sm font-semibold text-muted">未完成计划</h4>
                {execution.unfinishedTasks.length ? execution.unfinishedTasks.slice(0, 5).map((task) => (
                  <button key={task.id} type="button" className="rounded-lg border border-line bg-white p-3 text-left hover:border-brand" onClick={() => openSource(task.source).catch((error: Error) => setStatus(error.message, true))}>
                    <div className="font-semibold [overflow-wrap:anywhere]">{task.title}</div>
                    <div className="mt-1 text-xs text-muted [overflow-wrap:anywhere]">{task.status} · {task.source.path}{task.dueDate ? ` · ${task.dueDate}` : ""}</div>
                  </button>
                )) : <EmptyState text="没有未完成计划项。" />}
              </div>
            </div>
          </Panel>
        </div>

        <div className="grid gap-4">
        <Panel title="问题和产出">
            <div className="grid gap-3 p-3">
              <div>
                <h4 className="mb-2 text-sm font-semibold text-muted">阻塞项</h4>
                {execution.blockers.length ? execution.blockers.slice(0, 4).map((blocker) => (
                  <button key={blocker.id} type="button" className="mb-2 w-full rounded-lg border border-line bg-white p-3 text-left hover:border-brand" onClick={() => openSource(blocker.source).catch((error: Error) => setStatus(error.message, true))}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="font-semibold [overflow-wrap:anywhere]">{blocker.problem}</div>
                      <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">{blocker.count} 次</span>
                    </div>
                    <div className="mt-1 text-xs text-muted [overflow-wrap:anywhere]">{blocker.nextStep || "下一步未填写"} · {blocker.source.path}</div>
                  </button>
                )) : <EmptyState text="没有阻塞项。" />}
              </div>
              <div>
                <h4 className="mb-2 text-sm font-semibold text-muted">最近产出</h4>
                {execution.evidence.length ? execution.evidence.slice(0, 4).map((item) => (
                  <button key={item.id} type="button" className="mb-2 w-full rounded-lg border border-line bg-white p-3 text-left hover:border-brand" onClick={() => openSource(item.source).catch((error: Error) => setStatus(error.message, true))}>
                    <div className="font-semibold [overflow-wrap:anywhere]">{item.title}</div>
                    <div className="mt-1 text-xs text-muted [overflow-wrap:anywhere]">{item.detail} · {item.source.path}</div>
                  </button>
                )) : <EmptyState text="还没有可追踪产出。" />}
              </div>
            </div>
          </Panel>

        <Panel title="复盘和下一步">
            <div className="grid gap-3 p-3">
              {execution.pendingReviews.slice(0, 3).map((item) => (
                <div key={item.id} className="rounded-lg border border-line bg-white p-3">
                  <div className="font-semibold [overflow-wrap:anywhere]">{item.plan.title}</div>
                  <div className="mt-1 text-xs text-muted [overflow-wrap:anywhere]">{item.reason}</div>
                  <div className="mt-3 flex justify-end gap-2">
                    <Button type="button" onClick={() => openSource(item.plan).catch((error: Error) => setStatus(error.message, true))}>打开计划</Button>
                    <Button type="button" variant="primary" onClick={() => createReviewFromPlan(item.plan.path).catch((error: Error) => setStatus(error.message, true))}>
                      <FilePlus2 className="h-4 w-4" />
                      生成复盘
                    </Button>
                  </div>
                </div>
              ))}
              {execution.suggestions.slice(0, 3).map((suggestion) => (
                <div key={suggestion.id} className="rounded-lg border border-line bg-white p-3">
                  <div className="font-semibold [overflow-wrap:anywhere]">{suggestion.title}</div>
                  <div className="mt-1 text-xs text-muted [overflow-wrap:anywhere]">{suggestion.reason}</div>
                  <div className="mt-2 text-sm [overflow-wrap:anywhere]">{suggestion.action}</div>
                  <div className="mt-3 flex justify-end">
                    <Button type="button" variant="primary" onClick={() => applySuggestion(suggestion).catch((error: Error) => setStatus(error.message, true))}>
                      <Check className="h-4 w-4" />
                      应用到路线
                    </Button>
                  </div>
                </div>
              ))}
              {!execution.pendingReviews.length && !execution.suggestions.length ? <EmptyState text="没有待复盘或调整建议。" /> : null}
            </div>
          </Panel>
        </div>
      </section>

      <details ref={maintenanceRef} className="mb-4 rounded-lg border border-line bg-white">
        <summary className="cursor-pointer px-4 py-3 font-semibold">手动维护</summary>
        <div ref={focusPanelRef}>
          <Panel title="当前焦点" action={<Button variant="primary" onClick={() => saveFocus().catch((error: Error) => setStatus(error.message, true))}><Check className="h-4 w-4" />保存焦点</Button>}>
            <div className="grid grid-cols-2 gap-3 p-4 max-[920px]:grid-cols-1">
              <label className="row-span-2 grid gap-1 text-sm text-muted">
                主目标
                <textarea className="min-h-28 rounded-md border border-line p-2 text-ink" value={focus.main_goal} onChange={(event) => setFocus({ ...focus, main_goal: event.target.value })} />
              </label>
              <Input label="当前阶段" value={focus.stage} onChange={(value) => setFocus({ ...focus, stage: value })} />
              <Input label="本周重点" value={focus.week} onChange={(value) => setFocus({ ...focus, week: value })} />
              <Input label="今日任务" value={focus.today} onChange={(value) => setFocus({ ...focus, today: value })} />
            </div>
          </Panel>
        </div>
        <Panel title="追加今日日志" action={<Button variant="primary" onClick={() => appendLog().catch((error: Error) => setStatus(error.message, true))}><Check className="h-4 w-4" />追加</Button>}>
          <div className="grid grid-cols-2 gap-3 p-4 max-[920px]:grid-cols-1">
            <Input label="日期" type="date" value={log.date} onChange={(value) => setLog({ ...log, date: value })} />
            <Input label="任务" value={log.task} onChange={(value) => setLog({ ...log, task: value })} />
            <Input label="结果" value={log.result} onChange={(value) => setLog({ ...log, result: value })} />
            <Input label="用时" value={log.hours} onChange={(value) => setLog({ ...log, hours: value })} />
            <Input label="证据或产出" value={log.evidence} onChange={(value) => setLog({ ...log, evidence: value })} />
            <Input label="关键收获" value={log.takeaway} onChange={(value) => setLog({ ...log, takeaway: value })} />
            <Input label="明日计划" value={log.next} onChange={(value) => setLog({ ...log, next: value })} />
          </div>
        </Panel>
      </details>

      <details className="rounded-lg border border-line bg-white">
        <summary className="cursor-pointer px-4 py-3 font-semibold">最近更新</summary>
        <RecentList files={summary.recent} onOpen={openSource} />
      </details>
    </section>
  );
}

function PriorityBadge({ value }: { value: "high" | "medium" | "low" }) {
  const config = {
    high: "bg-red-50 text-red-700",
    medium: "bg-amber-50 text-amber-700",
    low: "bg-slate-100 text-slate-600"
  }[value];
  const label = { high: "高", medium: "中", low: "低" }[value];
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${config}`}>{label}</span>;
}
