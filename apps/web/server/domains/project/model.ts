/**
 * 项目上下文的核心概念（统一语言的载体）。
 * 持久化契约由 packages/db 的窄接口（ProjectStore）持有，此处归口 re-export，不重复定义。
 */
export type { Project, ProjectRepo, ProjectSummary } from "@next-build/db";
