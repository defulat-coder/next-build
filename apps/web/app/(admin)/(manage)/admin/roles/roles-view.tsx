"use client";

import { PERMISSIONS, type PermissionCode } from "@next-build/db/permissions";
import { IconCheck, IconLock, IconShieldLock, IconX } from "@tabler/icons-react";
import * as React from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

function hasSamePermissions(draft: ReadonlySet<PermissionCode>, permissions: readonly PermissionCode[]) {
  return draft.size === permissions.length && permissions.every((code) => draft.has(code));
}

function scopeLabel(scope: RoleWithPermissionsDto["scope"]) {
  return scope === "site" ? "整站" : "项目";
}

export function RolesView() {
  const [roles, setRoles] = React.useState<RoleWithPermissionsDto[] | null>(null);
  const [drafts, setDrafts] = React.useState<Record<string, ReadonlySet<PermissionCode>>>({});
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/roles");
      if (!res.ok) {
        setLoadError(await readApiError(res));
        return;
      }
      const nextRoles = (await res.json()) as RoleWithPermissionsDto[];
      setRoles(nextRoles);
      setDrafts(Object.fromEntries(nextRoles.map((role) => [role.id, new Set(role.permissions)])));
    } catch {
      setLoadError("网络异常，请重试。");
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const dirtyRoles =
    roles?.filter((role) => {
      // site:admin 后端短路恒为全权限（docs/architecture-rbac-menu.md §1），不提交其映射。
      if (role.code === "site:admin") return false;
      return !hasSamePermissions(drafts[role.id] ?? new Set(role.permissions), role.permissions);
    }) ?? [];

  function hasPermission(role: RoleWithPermissionsDto, code: PermissionCode) {
    return role.code === "site:admin" || (drafts[role.id] ?? new Set(role.permissions)).has(code);
  }

  function toggle(role: RoleWithPermissionsDto, code: PermissionCode) {
    if (role.code === "site:admin") return;

    setDrafts((previous) => {
      const next = new Set(previous[role.id] ?? role.permissions);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return { ...previous, [role.id]: next };
    });
  }

  function resetDrafts() {
    if (!roles) return;
    setDrafts(Object.fromEntries(roles.map((role) => [role.id, new Set(role.permissions)])));
  }

  async function handleSave() {
    if (dirtyRoles.length === 0) return;

    setSaving(true);
    const results = await Promise.all(
      dirtyRoles.map(async (role) => {
        try {
          const res = await fetch(`/api/admin/roles/${role.id}/permissions`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ permissions: [...(drafts[role.id] ?? role.permissions)] }),
          });
          if (!res.ok) return { error: await readApiError(res), role };
          return { role };
        } catch {
          return { error: "网络异常，请重试。", role };
        }
      }),
    );
    setSaving(false);

    const savedRoleIds = new Set(results.filter((result) => !result.error).map((result) => result.role.id));
    const failures = results.filter((result) => result.error);

    if (savedRoleIds.size > 0) {
      setRoles((previous) =>
        previous?.map((role) =>
          savedRoleIds.has(role.id)
            ? { ...role, permissions: [...(drafts[role.id] ?? role.permissions)] }
            : role,
        ) ?? null,
      );
    }

    if (failures.length > 0) {
      toast({
        title: failures.length === dirtyRoles.length ? "保存失败" : "部分角色未保存",
        description: failures.map((failure) => `「${failure.role.name}」：${failure.error}`).join("；"),
        variant: "destructive",
      });
      return;
    }

    toast({ title: `已保存 ${savedRoleIds.size} 个角色的权限配置` });
  }

  return (
    <>
      <PageHeader
        title="角色与权限"
        description="在矩阵中直接授予或撤销权限；保存时仅提交已变更的角色。"
        actions={
          <div className="flex items-center gap-2">
            {dirtyRoles.length > 0 ? (
              <span className="text-muted-foreground hidden text-xs lg:inline">
                {dirtyRoles.length} 个角色待保存
              </span>
            ) : null}
            <Button variant="outline" onClick={resetDrafts} disabled={saving || dirtyRoles.length === 0}>
              撤销更改
            </Button>
            <Button onClick={() => void handleSave()} disabled={saving || dirtyRoles.length === 0}>
              {saving ? "保存中…" : "保存更改"}
            </Button>
          </div>
        }
      />

      {loadError ? (
        <p className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm" role="alert">
          {loadError}
        </p>
      ) : null}

      {roles === null ? (
        loadError ? null : <p className="text-muted-foreground text-sm">加载中…</p>
      ) : roles.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center">
          <IconShieldLock className="text-muted-foreground size-8" />
          <p className="font-medium">还没有角色</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span>点击单元格切换：<strong className="text-foreground">✓</strong> 已授予，<strong className="text-foreground">×</strong> 未授予。</span>
            <span className="inline-flex items-center gap-1">
              <IconLock className="size-3" /> 管理员始终拥有全部权限，不能修改。
            </span>
          </div>

          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <Table className="min-w-[1280px]">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead
                      scope="col"
                      className="bg-card sticky left-0 z-20 min-w-52 border-r px-4 py-3 font-semibold text-foreground"
                    >
                      角色 / 权限
                    </TableHead>
                    {ALL_PERMISSIONS.map(([code, description]) => (
                      <TableHead key={code} scope="col" className="min-w-24 px-2 py-3 text-center align-bottom">
                        <span className="block text-foreground text-xs font-medium">{description}</span>
                        <span className="mt-1 block font-mono text-[10px] leading-none">{code}</span>
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {SCOPE_GROUPS.map((group) => {
                    const groupRoles = roles.filter((role) => role.scope === group.scope);
                    if (groupRoles.length === 0) return null;

                    return (
                      <React.Fragment key={group.scope}>
                        <TableRow className="bg-muted/40 hover:bg-muted/40">
                          <TableCell colSpan={ALL_PERMISSIONS.length + 1} className="px-4 py-2">
                            <span className="font-medium text-xs">{group.title}</span>
                            <span className="text-muted-foreground ml-2 text-xs">{group.description}</span>
                          </TableCell>
                        </TableRow>
                        {groupRoles.map((role) => {
                          const isSiteAdmin = role.code === "site:admin";
                          return (
                            <TableRow key={role.id}>
                              <TableHead
                                scope="row"
                                className="bg-card sticky left-0 z-10 min-w-52 border-r px-4 py-3 text-left"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-foreground">{role.name}</span>
                                  <Badge
                                    className={
                                      role.scope === "site"
                                        ? "bg-primary/10 text-primary border-0"
                                        : "bg-muted text-muted-foreground border-0"
                                    }
                                  >
                                    {scopeLabel(role.scope)}
                                  </Badge>
                                </div>
                                <span className="text-muted-foreground mt-1 block font-mono text-[11px] font-normal">
                                  {role.code}
                                </span>
                              </TableHead>
                              {ALL_PERMISSIONS.map(([code, description]) => {
                                const granted = hasPermission(role, code);
                                const action = granted ? "撤销" : "授予";

                                return (
                                  <TableCell key={code} className="p-2 text-center">
                                    <Button
                                      type="button"
                                      size="icon-sm"
                                      variant="ghost"
                                      aria-label={
                                        isSiteAdmin
                                          ? `${role.name}始终拥有「${description}」权限`
                                          : `${action}${role.name}的「${description}」权限`
                                      }
                                      aria-pressed={isSiteAdmin ? undefined : granted}
                                      title={
                                        isSiteAdmin
                                          ? "管理员始终拥有此权限"
                                          : `${action}「${description}」权限`
                                      }
                                      disabled={saving || isSiteAdmin}
                                      onClick={() => toggle(role, code)}
                                      className={
                                        isSiteAdmin
                                          ? "bg-muted text-muted-foreground hover:bg-muted"
                                          : granted
                                            ? "bg-primary text-primary-foreground hover:bg-primary/90"
                                            : "border border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground"
                                      }
                                    >
                                      {granted ? <IconCheck aria-hidden="true" /> : <IconX aria-hidden="true" />}
                                    </Button>
                                  </TableCell>
                                );
                              })}
                            </TableRow>
                          );
                        })}
                      </React.Fragment>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
