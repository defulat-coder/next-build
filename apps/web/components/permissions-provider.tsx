"use client";

import type { PermissionCode } from "@next-build/db/permissions";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

import { readApiError } from "@/lib/api-error";

/**
 * 权限上下文（docs/architecture-rbac-menu.md §4 第三层防线：前端展示）。
 * 登录后一次性拉取当前用户权限码全集（整站 ∪ 各项目），驱动菜单过滤与按钮显隐；
 * 真正的拦截在 API 层与页面层，此处只是体验层。
 */

interface PermissionsContextValue {
  /** 权限码集合；null = 尚未加载完成（带权限码的菜单/按钮先不渲染，避免越权闪现）。 */
  permissions: ReadonlySet<PermissionCode> | null;
  hasPermission: (code: PermissionCode) => boolean;
  /** 项目动作必须按当前 projectId 判定，不能使用其他项目拍平后的同名权限。 */
  hasProjectPermission: (projectId: string, code: PermissionCode) => boolean;
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

/** GET /api/me/permissions 的响应形状（server/application/iam/get-my-permissions.ts）。 */
export interface MyPermissionsDto {
  permissions: PermissionCode[];
  projects: { permissions: PermissionCode[]; projectId: string }[];
  siteRole: string | null;
}

export function hasProjectPermissionIn(
  snapshot: MyPermissionsDto | null,
  projectId: string,
  code: PermissionCode,
): boolean {
  return (
    snapshot?.siteRole === "site:admin" ||
    snapshot?.projects.find((project) => project.projectId === projectId)?.permissions.includes(code) === true
  );
}

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const [snapshot, setSnapshot] = useState<MyPermissionsDto | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/permissions")
      .then(async (res) => {
        if (!res.ok) throw new Error(await readApiError(res));
        return (await res.json()) as MyPermissionsDto;
      })
      .then((data) => {
        if (!cancelled) {
          setSnapshot(data);
        }
      })
      .catch(() => {
        // 拉取失败（含未登录的 401）：按空集合处理，宁可少显示也不错显示。
        if (!cancelled) setSnapshot({ permissions: [], projects: [], siteRole: null });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const permissions = useMemo(
    () => (snapshot ? new Set(snapshot.permissions) : null),
    [snapshot],
  );

  const hasPermission = useCallback((code: PermissionCode) => permissions?.has(code) ?? false, [permissions]);

  const hasProjectPermission = useCallback(
    (projectId: string, code: PermissionCode) => hasProjectPermissionIn(snapshot, projectId, code),
    [snapshot],
  );

  const value = useMemo(
    () => ({ hasPermission, hasProjectPermission, permissions }),
    [hasPermission, hasProjectPermission, permissions],
  );

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

/** 当前用户权限判定；Provider 之外（如登录页）视为无任何权限。 */
export function usePermissions(): PermissionsContextValue {
  const context = useContext(PermissionsContext);
  return context ?? { hasPermission: () => false, hasProjectPermission: () => false, permissions: null };
}
