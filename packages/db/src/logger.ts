/**
 * packages 是库：不自带全局日志输出，只接受宿主注入的 Logger（AGENTS.md「日志」）。
 * 结构上是 pino Logger 的最小子集，apps/web 的组合根直接传 logger.child() 即可。
 */
export interface Logger {
  info(fields: Record<string, unknown>, message: string): void;
  warn(fields: Record<string, unknown>, message: string): void;
  error(fields: Record<string, unknown>, message: string): void;
}
