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
}

const PermissionsContext = createContext<PermissionsContextValue | null>(null);

/** GET /api/me/permissions 的响应形状（server/application/iam/get-my-permissions.ts）。 */
interface MyPermissionsDto {
  permissions: PermissionCode[];
}

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const [permissions, setPermissions] = useState<ReadonlySet<PermissionCode> | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me/permissions")
      .then(async (res) => {
        if (!res.ok) throw new Error(await readApiError(res));
        return (await res.json()) as MyPermissionsDto;
      })
      .then((data) => {
        if (!cancelled) setPermissions(new Set(data.permissions));
      })
      .catch(() => {
        // 拉取失败（含未登录的 401）：按空集合处理，宁可少显示也不错显示。
        if (!cancelled) setPermissions(new Set());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const hasPermission = useCallback(
    (code: PermissionCode) => permissions?.has(code) ?? false,
    [permissions],
  );

  const value = useMemo(() => ({ hasPermission, permissions }), [hasPermission, permissions]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

/** 当前用户权限判定；Provider 之外（如登录页）视为无任何权限。 */
export function usePermissions(): PermissionsContextValue {
  const context = useContext(PermissionsContext);
  return context ?? { hasPermission: () => false, permissions: null };
}
