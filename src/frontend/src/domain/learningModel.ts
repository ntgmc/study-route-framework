export const focusLabels = {
  main_goal: "主目标",
  stage: "当前阶段",
  week: "本周重点",
  today: "今日任务"
} as const;



export function createInitialFocus(focus: Record<string, string>) {
  return {
    main_goal: focus[focusLabels.main_goal] || "",
    stage: focus[focusLabels.stage] || "",
    week: focus[focusLabels.week] || "",
    today: focus[focusLabels.today] || ""
  };
}

export function createInitialDailyLog(today: string) {
  return { date: today, task: "", result: "", hours: "", evidence: "", takeaway: "", next: "" };
}
