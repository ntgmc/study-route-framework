export function defaultContent(section: string, title: string): string {
  const today = new Date().toISOString().slice(0, 10);
  const cleanTitle = title.trim() || "未命名";

  if (section === "logs") {
    return `# 学习记录

## 基本信息

- 日期：${today}
- 关联目标：
- 关联计划：
- 实际学习时长：
- 今日状态：

## 今日完成

| 任务 | 结果 | 用时 | 证据或产出 |
| --- | --- | ---: | --- |

## 关键收获

## 遇到的问题

| 问题 | 当前判断 | 下一步 |
| --- | --- | --- |

## 明日计划

## 备注
`;
  }

  if (section === "plans") {
    return `# 学习计划：${cleanTitle}

## 基本信息

- 创建日期：${today}
- 关联目标：
- 关联路线：
- 周期主题：
- 计划总时长：

## 本周期目标

| 目标 | 验收方式 | 优先级 |
| --- | --- | --- |

## 任务安排

| 日期 | 任务 | 预计用时 | 产出物 | 状态 |
| --- | --- | ---: | --- | --- |

## 风险与调整

## 复盘入口
`;
  }

  if (section === "reviews") {
    return `# ${cleanTitle}

## 本期结论

## 完成情况

| 项目 | 计划 | 实际 | 判断 |
| --- | --- | --- | --- |

## 关键产出

| 来源 | 任务 | 结果 | 证据或产出 |
| --- | --- | --- | --- |

## 问题与调整

## 下期重点
`;
  }

  if (section === "resources") {
    return `# ${cleanTitle}

## 基本信息

- 创建日期：${today}
- 类型：
- 链接：
- 适用阶段：

## 摘要

## 使用计划

## 关键笔记
`;
  }

  if (section === "projects") {
    return `# ${cleanTitle}

## 项目定位

## MVP 范围

## 技术栈

## 里程碑

| 阶段 | 目标 | 验收标准 | 状态 |
| --- | --- | --- | --- |

## 简历表达
`;
  }

  return `# ${cleanTitle}

## 基本信息

- 创建日期：${today}

## 内容
`;
}
