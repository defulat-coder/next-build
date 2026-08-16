import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import ForbiddenError from "@/components/errors/forbidden";
import { logger } from "@/lib/logger";
import { createGetCurrentUser } from "@/server/application/auth/get-current-user";
import { createGetMyPermissions } from "@/server/application/iam/get-my-permissions";
import { authStore, iamStore } from "@/server/composition-root";
import { SESSION_COOKIE } from "@/server/interface/http/cookies";

import { RolesView } from "./roles-view";

/**
 * 角色与权限管理页（role:manage 专属）。
 * 页面级权限校验（docs/architecture-rbac-menu.md §4 第二层防线）：server 组件直接调用例，
 * 无 role:manage 权限渲染 403 页；直接输 URL 也到此为止，真正的拦截仍在 API 层。
 */
export default async function AdminRolesPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) redirect("/login");

  const userResult = await createGetCurrentUser({ authStore })(token);
  if (!userResult.ok) {
    logger.error({ err: userResult.error.cause, event: "auth.current_user.failed" }, "查询当前用户失败");
    throw new Error(userResult.error.message);
  }
  if (!userResult.value) redirect("/login");

  const permissionsResult = await createGetMyPermissions({ iamStore })(userResult.value.id);
  if (!permissionsResult.ok) {
    logger.error(
      { err: permissionsResult.error.cause, event: "iam.my_permissions.failed", user_id: userResult.value.id },
      "查询用户权限失败",
    );
    throw new Error(permissionsResult.error.message);
  }
  if (!permissionsResult.value.permissions.includes("role:manage")) {
    return <ForbiddenError />;
  }

  return (
    <main id="main-content" className="flex min-h-min flex-1 flex-col p-4 sm:p-6">
      <RolesView />
    </main>
  );
}
