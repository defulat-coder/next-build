import { err, type Result } from "@next-build/result";
import type { Logger, ProjectMember } from "@next-build/db";

import { checkProjectPermission } from "./check-project-permission";
import type { IamError } from "@/server/domains/iam/errors";
import { iamErrorFromDb } from "@/server/domains/iam/errors";
import type { ActorContext } from "@/server/domains/iam/model";
import type { IamStore } from "@/server/domains/iam/ports";

export function createListProjectMembers(deps: { iamStore: IamStore; logger: Logger }) {
  return async (input: { actor: ActorContext; projectId: string }): Promise<Result<ProjectMember[], IamError>> => {
    const allowed = checkProjectPermission(input.actor, input.projectId, "project:read", deps.logger);
    if (!allowed.ok) return allowed;
    const members = await deps.iamStore.listProjectMembers(input.projectId);
    return members.ok ? members : err(iamErrorFromDb(members.error));
  };
}
