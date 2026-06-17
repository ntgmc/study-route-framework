export type CliCommand =
  | "init-log"
  | "add-log"
  | "leetcode"
  | "exam-review"
  | "dashboard"
  | "week-plan";

export interface ParsedCli {
  command: CliCommand;
  options: Record<string, string | string[] | boolean | undefined>;
}
