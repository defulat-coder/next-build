"use client";

import { PERMISSIONS, type PermissionCode } from "@next-build/db/permissions";
import { IconShieldLock } from "@tabler/icons-react";
import * as React from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { readApiError } from "@/lib/api-error";
import { toast } from "@/lib/toast";

/** GET /api/admin/roles 的列表项（packages/db RoleWithPermissions）。 */
interface RoleWithPermissionsDto {
  id: string;
  code: string;
  scope: "site" | "project";
  name: string;
  builtIn: boolean;
  permissions: PermissionCode[];
}

/** 全部权限码及其中文说明（与后端常量表同源：@next-build/db/permissions）。 */
const ALL_PERMISSIONS = Object.entries(PERMISSIONS) as [PermissionCode, string][];

const SCOPE_GROUPS: { scope: "site" | "project"; title: string; description: string }[] = [
  { scope: "site", title: "整站角色", description: "决定用户「能在平台做什么」。" },
  { scope: "project", title: "项目角色", description: "决定用户「能在某个项目里做什么」。" },
];

export function RolesView() {
  const [roles, setRoles] = React.useState<RoleWithPermissionsDto[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/roles");
      if (!res.ok) {
        setLoadError(await readApiError(res));
        return;
      }
      setRoles(await res.json());
    } catch {
      setLoadError("网络异常，请重试。");
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="角色与权限"
        description="按角色勾选权限码，保存即全量替换该角色的权限映射。"
      />

      {loadError ? (
        <p className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm" role="alert">
          {loadError}
        </p>
      ) : null}

      {roles === null && !loadError ? (
        <p className="text-muted-foreground text-sm">加载中…</p>
      ) : roles !== null && roles.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center">
          <IconShieldLock className="text-muted-foreground size-8" />
          <p className="font-medium">还没有角色</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {SCOPE_GROUPS.map((group) => {
            const groupRoles = roles?.filter((role) => role.scope === group.scope) ?? [];
            if (groupRoles.length === 0) return null;
            return (
              <section key={group.scope}>
                <h3 className="font-medium">{group.title}</h3>
                <p className="text-muted-foreground mt-1 text-sm">{group.description}</p>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  {groupRoles.map((role) => (
                    <RolePermissionsCard key={role.id} role={role} onSaved={load} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function RolePermissionsCard({
  role,
  onSaved,
}: {
  role: RoleWithPermissionsDto;
  onSaved: () => void;
}) {
  // site:admin 后端短路恒为全权限（docs/architecture-rbac-menu.md §1），勾选置灰、不提交。
  const isSiteAdmin = role.code === "site:admin";
  const [draft, setDraft] = React.useState<ReadonlySet<PermissionCode>>(
    () => new Set(role.permissions),
  );
  const [saving, setSaving] = React.useState(false);

  const dirty =
    draft.size !== role.permissions.length ||
    role.permissions.some((code) => !draft.has(code));

  function toggle(code: PermissionCode, checked: boolean) {
    setDraft((prev) => {
      const next = new Set(prev);
      if (checked) {
        next.add(code);
      } else {
        next.delete(code);
      }
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/roles/${role.id}/permissions`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ permissions: [...draft] }),
      });
      if (!res.ok) {
        toast({ title: "保存失败", description: await readApiError(res), variant: "destructive" });
        return;
      }
      toast({ title: `已保存「${role.name}」的权限配置` });
      onSaved();
    } catch {
      toast({ title: "保存失败", description: "网络异常，请重试。", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>{role.name}</CardTitle>
          <Badge className="bg-muted text-muted-foreground">{role.code}</Badge>
        </div>
        {isSiteAdmin ? (
          <CardDescription>管理员恒拥有全部权限，无需配置。</CardDescription>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {ALL_PERMISSIONS.map(([code, description]) => (
            <label
              key={code}
              className={
                isSiteAdmin
                  ? "flex items-start gap-2 opacity-60"
                  : "flex items-start gap-2"
              }
            >
              <Checkbox
                checked={isSiteAdmin ? true : draft.has(code)}
                disabled={isSiteAdmin}
                onCheckedChange={(checked) => toggle(code, checked === true)}
                className="mt-0.5"
              />
              <span className="grid gap-0.5 leading-tight">
                <span className="text-sm">{description}</span>
                <span className="text-muted-foreground text-xs">{code}</span>
              </span>
            </label>
          ))}
        </div>
        {!isSiteAdmin ? (
          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving || !dirty}>
              {saving ? "保存中…" : "保存"}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
