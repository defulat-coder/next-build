import { err, ok, type Result } from "@next-build/result";
import type { IamStore, KnowledgeStore, Logger, TaskStore } from "@next-build/db";

import { checkProjectPermission } from "@/server/application/iam/check-project-permission";
import type { ActorContext } from "@/server/domains/iam/model";
import type { ProjectError } from "@/server/domains/project/errors";
import { projectErrorFromStore } from "@/server/domains/project/errors";
import type { ProjectStore } from "@/server/domains/project/ports";

export function createGetProjectDeliveryOverview(deps: {
  projectStore: ProjectStore; taskStore: TaskStore; knowledgeStore: KnowledgeStore; iamStore: IamStore; logger: Logger;
}) {
  return async (input: { actor: ActorContext; projectId: string }): Promise<Result<{
    taskSummary: { executing: number; review: number; acceptancePending: number; accepted: number; failed: number };
    knowledge: { published: boolean; stale: boolean };
    members: Array<{ userId: string; name: string; role: string }>;
    eligibility: { task: { ready: boolean; blocker: string | null }; wiki: { ready: boolean; blocker: string | null }; ask: { ready: boolean; blocker: string | null } };
  }, ProjectError>> => {
    const allowed = checkProjectPermission(input.actor, input.projectId, "project:read", deps.logger);
    if (!allowed.ok) return allowed;
    const project = await deps.projectStore.getProject(input.projectId);
    if (!project.ok) return err(projectErrorFromStore(project.error));
    if (!project.value) return err({ code: "PROJECT_NOT_FOUND", kind: "business", message: "项目不存在" });
    const [tasks, generations, members] = await Promise.all([
      deps.taskStore.listTasks(input.projectId), deps.knowledgeStore.listGenerations(input.projectId), deps.iamStore.listProjectMembers(input.projectId),
    ]);
    if (!tasks.ok) return err(projectErrorFromStore(tasks.error));
    if (!generations.ok) return err(projectErrorFromStore(generations.error));
    if (!members.ok) return err(projectErrorFromStore(members.error));
    const published = generations.value.find((generation) => generation.status === "published") ?? null;
    const latest = generations.value[0] ?? null;
    const available = project.value.repos.filter((repo) => repo.accessStatus === "available");
    const allAvailable = project.value.repos.length > 0 && available.length === project.value.repos.length;
    return ok({
      eligibility: {
        ask: { blocker: published ? null : "需要已发布知识版本", ready: Boolean(published) },
        task: {
          blocker: available.length === 0 ? "需要可访问仓库" : members.value.length === 0 ? "需要项目验收人" : null,
          ready: available.length > 0 && members.value.length > 0,
        },
        wiki: { blocker: allAvailable ? null : "要求全部仓库可访问", ready: allAvailable },
      },
      knowledge: { published: Boolean(published), stale: !published || latest?.id !== published.id },
      members: members.value.map((member) => ({ name: member.name, role: member.role, userId: member.userId })),
      taskSummary: {
        acceptancePending: tasks.value.filter((detail) => detail.task.status === "acceptance_pending").length,
        accepted: tasks.value.filter((detail) => detail.task.status === "accepted").length,
        executing: tasks.value.filter((detail) => ["queued", "running"].includes(detail.task.status)).length,
        failed: tasks.value.filter((detail) => detail.task.status === "failed").length,
        review: tasks.value.filter((detail) => detail.task.status === "review").length,
      },
    });
  };
}
