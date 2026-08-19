/**
 * 项目上下文的核心概念（统一语言的载体）。
 * 持久化契约由 packages/db 的窄接口（ProjectStore）持有，此处归口 re-export，不重复定义。
 */
import type {
  Project as StoredProject,
  ProjectDetail as StoredProjectDetail,
  ProjectRepo,
  ProjectSummary as StoredProjectSummary,
} from "@next-build/db";

export type Project = StoredProject;
export type { ProjectRepo };
export type ProjectReadiness = "setup_required" | "ready" | "needs_attention";

export interface ProjectDetail extends StoredProjectDetail {
  readiness: ProjectReadiness;
}

export interface ProjectSummary extends StoredProjectSummary {
  readiness: ProjectReadiness;
}

/** 项目上下文规则：无仓待配置；主仓可访问才就绪，否则需要处理。 */
export function deriveReadiness(input: {
  repoCount: number;
  primaryRepo: ProjectRepo | null;
}): ProjectReadiness {
  if (input.repoCount === 0) return "setup_required";
  return input.primaryRepo?.accessStatus === "available" ? "ready" : "needs_attention";
}
