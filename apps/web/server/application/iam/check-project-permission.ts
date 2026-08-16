import { err, type Result } from "@next-build/result";
import type { Logger } from "@next-build/db";

import { hasProjectPermission } from "@/server/domains/iam/access";
import type { ForbiddenError } from "@/server/domains/iam/errors";
import type { ActorContext, PermissionCode } from "@/server/domains/iam/model";

/**
 * 用例内项目级权限判定（docs/architecture-rbac-menu.md §4：路由中间件不猜资源归属，项目级判定在用例内做）。
 * 不足返回 FORBIDDEN 并记 authz.denied（warn，拒绝必须打点，不静默）。
 */
export function checkProjectPermission(
  actor: ActorContext,
  projectId: string,
  permission: PermissionCode,
  logger: Logger,
): Result<void, ForbiddenError> {
  if (hasProjectPermission(actor.permissions, projectId, permission)) return { ok: true, value: undefined };
  logger.warn(
    { event: "authz.denied", permission, project_id: projectId, user_id: actor.userId },
    "项目级权限不足",
  );
  return err({ code: "FORBIDDEN", kind: "business", message: "没有该项目的操作权限" });
}
