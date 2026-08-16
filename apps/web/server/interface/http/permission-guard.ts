import { createMiddleware } from "hono/factory";

import { logger } from "@/lib/logger";
import { hasSitePermission } from "@/server/domains/iam/access";
import type { PermissionCode } from "@/server/domains/iam/model";

import type { AuthVariables } from "./auth-guard";

/**
 * 权限中间件工厂（API 层主防线，docs/architecture-rbac-menu.md §4）：路由声明所需整站级权限码。
 * 权限取 authGuard 已解析的 context 集合，不重复查库；不足返回 403 并记 authz.denied（拒绝必打点）。
 * 项目级权限不在此判定（中间件不猜资源归属），由用例内 checkProjectPermission 完成。
 */
export function requirePermission(permission: PermissionCode) {
  return createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
    const user = c.get("authUser");
    const permissions = c.get("userPermissions");
    if (!hasSitePermission(permissions, permission)) {
      logger.warn(
        { event: "authz.denied", path: c.req.path, permission, user_id: user.id },
        "整站权限不足",
      );
      return c.json({ error: { code: "FORBIDDEN", message: "没有执行此操作的权限" } }, 403);
    }
    return next();
  });
}
