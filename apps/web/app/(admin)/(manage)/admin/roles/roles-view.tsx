"use client";

import { PERMISSIONS, type PermissionCode, type RoleCode } from "@next-build/db/permissions";
import { IconChevronRight, IconShieldLock } from "@tabler/icons-react";
import * as React from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { readApiError } from "@/lib/api-error";
import { toast } from "@/lib/toast";

/** GET /api/admin/roles 的列表项（packages/db RoleWithPermissions）。 */
interface RoleWithPermissionsDto {
  id: string;
  code: RoleCode;
  scope: "site" | "project";
  name: string;
  builtIn: boolean;
  permissions: PermissionCode[];
}

const ROLE_ORDER: readonly RoleCode[] = [
  "site:admin",
  "site:member",
  "site:viewer",
  "project:owner",
  "project:member",
  "project:viewer",
];

const PERMISSION_CODES = Object.keys(PERMISSIONS) as PermissionCode[];

type PermissionDirectory = {
  children: readonly PermissionNode[];
  id: string;
  label: string;
  type: "directory";
};

type PermissionLeaf = {
  code: PermissionCode;
  type: "permission";
};

type PermissionNode = PermissionDirectory | PermissionLeaf;

type PermissionLeafInfo = {
  code: PermissionCode;
  path: readonly string[];
  rootId: string;
};

/**
 * 资源目录只服务于矩阵的阅读与收起，不改变服务端的权限码或授权逻辑。
 * 所有实际可配置项都是与 PERMISSIONS 一一对应的叶子节点。
 */
const PERMISSION_TREE: readonly PermissionNode[] = [
  {
    id: "project",
    label: "项目",
    type: "directory",
    children: [
      { code: "project:read", type: "permission" },
      { code: "project:create", type: "permission" },
      { code: "project:update", type: "permission" },
      { code: "project:delete", type: "permission" },
      {
        id: "project-repository",
        label: "仓库",
        type: "directory",
        children: [{ code: "repo:manage", type: "permission" }],
      },
      {
        id: "project-member",
        label: "成员",
        type: "directory",
        children: [{ code: "member:manage", type: "permission" }],
      },
    ],
  },
  {
    id: "task",
    label: "任务",
    type: "directory",
    children: [
      { code: "task:read", type: "permission" },
      { code: "task:create", type: "permission" },
    ],
  },
  {
    id: "knowledge",
    label: "知识与问答",
    type: "directory",
    children: [
      {
        id: "knowledge-wiki",
        label: "Wiki",
        type: "directory",
        children: [
          { code: "wiki:read", type: "permission" },
          { code: "wiki:generate", type: "permission" },
        ],
      },
      { code: "ask:query", type: "permission" },
    ],
  },
  {
    id: "platform-management",
    label: "整站管理",
    type: "directory",
    children: [
      {
        id: "platform-user",
        label: "用户",
        type: "directory",
        children: [{ code: "user:manage", type: "permission" }],
      },
      {
        id: "platform-role",
        label: "角色",
        type: "directory",
        children: [{ code: "role:manage", type: "permission" }],
      },
    ],
  },
];

const RESOURCE_DIRECTORIES = PERMISSION_TREE.filter(
  (node): node is PermissionDirectory => node.type === "directory",
);

function hasSamePermissions(draft: ReadonlySet<PermissionCode>, permissions: readonly PermissionCode[]) {
  return draft.size === permissions.length && permissions.every((code) => draft.has(code));
}

function permissionCount(node: PermissionNode): number {
  return node.type === "permission" ? 1 : node.children.reduce((count, child) => count + permissionCount(child), 0);
}

function flattenPermissions(
  nodes: readonly PermissionNode[],
  path: readonly string[] = [],
  rootId?: string,
): PermissionLeafInfo[] {
  return nodes.flatMap((node) => {
    if (node.type === "permission") {
      if (!rootId) throw new Error("权限叶子必须归属于资源目录");
      return [{ code: node.code, path, rootId }];
    }
    return flattenPermissions(node.children, [...path, node.label], rootId ?? node.id);
  });
}

const PERMISSION_LEAVES = flattenPermissions(PERMISSION_TREE);

function ResourceDirectoryToggle({
  collapsed,
  directory,
  onToggle,
}: {
  collapsed: boolean;
  directory: PermissionDirectory;
  onToggle: () => void;
}) {
  const count = permissionCount(directory);

  return (
    <button
      type="button"
      aria-expanded={!collapsed}
      className={`flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors focus-visible:ring-ring focus-visible:ring-1 focus-visible:outline-hidden ${
        collapsed ? "text-muted-foreground hover:bg-muted hover:text-foreground" : "bg-muted text-foreground"
      }`}
      onClick={onToggle}
    >
      <IconChevronRight aria-hidden="true" className={`size-4 transition-transform duration-150 ${collapsed ? "" : "rotate-90"}`} />
      <span>{directory.label}</span>
      <span className="text-muted-foreground tabular-nums">{count}</span>
    </button>
  );
}

function PermissionToggle({
  changed,
  description,
  failed,
  granted,
  isScopeEnd,
  onToggle,
  role,
  saving,
}: {
  changed: boolean;
  description: string;
  failed: boolean;
  granted: boolean;
  isScopeEnd: boolean;
  onToggle: () => void;
  role: RoleWithPermissionsDto;
  saving: boolean;
}) {
  const isSiteAdmin = role.code === "site:admin";
  const action = granted ? "撤销" : "授予";
  const unsavedHint = changed ? "（未保存的修改）" : "";

  return (
    <TableCell
      className={`relative h-12 p-2 text-center ${isSiteAdmin ? "bg-muted/35" : ""} ${
        changed ? "bg-primary/[0.055]" : ""
      } ${failed && !changed ? "bg-destructive/[0.04]" : ""} ${isScopeEnd ? "border-r border-border/80" : ""}`}
    >
      {changed ? <span aria-hidden="true" className="bg-primary absolute top-2 left-2 size-1.5 rounded-full" /> : null}
      <Switch
        checked={isSiteAdmin || granted}
        aria-label={
          isSiteAdmin
            ? `${role.name}始终拥有「${description}」权限`
            : `${action}${role.name}的「${description}」权限${unsavedHint}`
        }
        disabled={saving || isSiteAdmin}
        onCheckedChange={onToggle}
        title={
          isSiteAdmin
            ? "整站管理员权限由系统固定，不能修改"
            : `${granted ? "已授予，点击撤销" : "未授予，点击授权"}「${description}」权限${unsavedHint}`
        }
        className="data-[state=checked]:bg-primary data-[state=checked]:hover:bg-primary/85 data-[state=unchecked]:bg-muted-foreground/35 data-[state=unchecked]:hover:bg-muted-foreground/50 disabled:cursor-not-allowed disabled:opacity-100"
      />
      {changed ? <span className="sr-only">未保存的修改</span> : null}
      {failed ? <span className="sr-only">上次保存此角色失败</span> : null}
    </TableCell>
  );
}

export function RolesView() {
  const [roles, setRoles] = React.useState<RoleWithPermissionsDto[] | null>(null);
  const [drafts, setDrafts] = React.useState<Record<string, ReadonlySet<PermissionCode>>>({});
  const [collapsedResourceIds, setCollapsedResourceIds] = React.useState<ReadonlySet<string>>(() => new Set());
  const [failedRoleIds, setFailedRoleIds] = React.useState<ReadonlySet<string>>(() => new Set());
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
      setFailedRoleIds(new Set());
    } catch {
      setLoadError("网络异常，请重试。");
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  const orderedRoles = React.useMemo(
    () => (roles ? [...roles].sort((left, right) => ROLE_ORDER.indexOf(left.code) - ROLE_ORDER.indexOf(right.code)) : []),
    [roles],
  );
  const siteRoles = orderedRoles.filter((role) => role.scope === "site");
  const projectRoles = orderedRoles.filter((role) => role.scope === "project");

  function hasPermission(role: RoleWithPermissionsDto, code: PermissionCode) {
    return role.code === "site:admin" || (drafts[role.id] ?? new Set(role.permissions)).has(code);
  }

  function hasPermissionChanged(role: RoleWithPermissionsDto, code: PermissionCode) {
    return role.code !== "site:admin" && role.permissions.includes(code) !== hasPermission(role, code);
  }

  const dirtyRoles =
    roles?.filter((role) => {
      // site:admin 后端短路恒为全权限（docs/architecture-rbac-menu.md §1），不提交其映射。
      if (role.code === "site:admin") return false;
      return !hasSamePermissions(drafts[role.id] ?? new Set(role.permissions), role.permissions);
    }) ?? [];
  const dirtyPermissionCount = roles?.reduce(
    (count, role) => count + PERMISSION_CODES.filter((code) => hasPermissionChanged(role, code)).length,
    0,
  ) ?? 0;
  const visiblePermissionLeaves = PERMISSION_LEAVES.filter((leaf) => !collapsedResourceIds.has(leaf.rootId));
  const failedRoles = orderedRoles.filter((role) => failedRoleIds.has(role.id));

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
    setFailedRoleIds((previous) => {
      if (!previous.has(role.id)) return previous;
      const next = new Set(previous);
      next.delete(role.id);
      return next;
    });
  }

  function resetDrafts() {
    if (!roles) return;
    setDrafts(Object.fromEntries(roles.map((role) => [role.id, new Set(role.permissions)])));
    setFailedRoleIds(new Set());
  }

  function toggleResourceDirectory(id: string) {
    setCollapsedResourceIds((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
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
    setFailedRoleIds(new Set(failures.map((failure) => failure.role.id)));

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
        description="资源纵向、角色横向；开关修改会先保留为草稿，保存后生效。"
      />

      {loadError ? (
        <div className="flex items-center justify-between gap-3 border-y border-destructive/25 py-3 text-sm" role="alert">
          <span className="text-destructive">{loadError}</span>
          <Button variant="outline" className="h-8 px-3 text-sm" onClick={() => void load()}>
            重新加载
          </Button>
        </div>
      ) : null}

      {roles === null ? (
        loadError ? null : <p className="text-muted-foreground text-sm">正在读取角色配置…</p>
      ) : roles.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center">
          <IconShieldLock className="text-muted-foreground size-8" />
          <p className="font-medium">还没有角色</p>
        </div>
      ) : (
        <div className="flex min-w-0 flex-col gap-4">
          {dirtyPermissionCount > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-y py-2.5" role="status">
              <p className="text-sm">
                <span className="font-semibold">{dirtyPermissionCount} 项草稿修改</span>
                <span className="text-muted-foreground"> · 将影响 {dirtyRoles.map((role) => role.name).join("、")}</span>
              </p>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={resetDrafts} disabled={saving}>
                  撤销
                </Button>
                <Button onClick={() => void handleSave()} disabled={saving}>
                  {saving ? "保存中…" : "保存更改"}
                </Button>
              </div>
            </div>
          ) : null}

          {failedRoles.length > 0 ? (
            <p className="border-y border-destructive/25 py-2.5 text-sm" role="alert">
              <span className="text-destructive">上次保存未完成：</span>
              {failedRoles.map((role) => role.name).join("、")}。受影响列已标记，可再次保存。
            </p>
          ) : null}

          <section className="min-w-0 overflow-hidden rounded-xl border bg-card" aria-label="角色权限矩阵">
            <div className="flex flex-col gap-3 border-b px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="font-semibold">资源目录</p>
                <p className="text-muted-foreground mt-1 text-sm">收起目录可暂时隐藏对应权限；权限码保留在资源路径后便于核对。</p>
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="收起或展开资源目录">
                {RESOURCE_DIRECTORIES.map((directory) => (
                  <ResourceDirectoryToggle
                    key={directory.id}
                    collapsed={collapsedResourceIds.has(directory.id)}
                    directory={directory}
                    onToggle={() => toggleResourceDirectory(directory.id)}
                  />
                ))}
              </div>
            </div>

            <p className="text-muted-foreground px-4 py-2 text-sm lg:hidden">左右滚动可查看其余角色。</p>
            <div className="relative">
              <Table className="min-w-[66rem] text-sm">
                <TableHeader>
                  <TableRow className="border-b hover:bg-transparent">
                    <TableHead
                      scope="col"
                      rowSpan={2}
                      className="bg-card sticky left-0 z-20 min-w-[17rem] border-r border-border/80 px-4 py-3 text-sm font-semibold text-foreground"
                    >
                      <span className="block">权限资源</span>
                      <span className="text-muted-foreground mt-1 block font-normal">动作、目录路径与权限码</span>
                    </TableHead>
                    <TableHead
                      scope="colgroup"
                      colSpan={siteRoles.length}
                      className="border-r border-border/80 bg-muted/[0.3] px-3 py-2 text-center text-sm font-semibold text-foreground"
                    >
                      整站角色 <span className="text-muted-foreground ml-1 font-normal">平台范围</span>
                    </TableHead>
                    <TableHead
                      scope="colgroup"
                      colSpan={projectRoles.length}
                      className="bg-muted/[0.18] px-3 py-2 text-center text-sm font-semibold text-foreground"
                    >
                      项目角色 <span className="text-muted-foreground ml-1 font-normal">单项目范围</span>
                    </TableHead>
                  </TableRow>
                  <TableRow className="border-b hover:bg-transparent">
                    {orderedRoles.map((role) => {
                      const isSiteAdmin = role.code === "site:admin";
                      const isScopeEnd = role.scope === "site" && role === siteRoles.at(-1);
                      return (
                        <TableHead
                          key={role.id}
                          scope="col"
                          className={`min-w-28 px-3 py-3 text-center text-sm align-bottom ${
                            isSiteAdmin ? "bg-muted/35" : ""
                          } ${isScopeEnd ? "border-r border-border/80" : ""}`}
                        >
                          <span className="block font-semibold text-foreground">{role.name}</span>
                          <span className="text-muted-foreground mt-1 block font-mono font-normal">{role.code}</span>
                          {isSiteAdmin ? <span className="text-muted-foreground mt-1 block font-normal">系统固定</span> : null}
                          {failedRoleIds.has(role.id) ? <span className="text-destructive mt-1 block font-normal">保存失败</span> : null}
                        </TableHead>
                      );
                    })}
                  </TableRow>
                </TableHeader>
                <TableBody className="[&_tr]:border-b-0">
                  {visiblePermissionLeaves.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={orderedRoles.length + 1} className="px-4 py-12 text-center text-sm text-muted-foreground">
                        所有资源目录均已收起。展开任一目录查看对应权限。
                      </TableCell>
                    </TableRow>
                  ) : (
                    visiblePermissionLeaves.map((leaf, index) => (
                      <TableRow key={leaf.code} className={index % 2 === 0 ? "bg-muted/[0.14] hover:bg-muted/[0.35]" : "hover:bg-muted/[0.35]"}>
                        <TableHead
                          scope="row"
                          className="bg-card sticky left-0 z-10 min-w-[17rem] border-r border-border/80 px-4 py-2 text-left text-sm"
                        >
                          <span className="block font-medium text-foreground">{PERMISSIONS[leaf.code]}</span>
                          <span className="text-muted-foreground mt-1 block font-normal">
                            {leaf.path.join(" / ")} <span className="font-mono">· {leaf.code}</span>
                          </span>
                        </TableHead>
                        {orderedRoles.map((role) => (
                          <PermissionToggle
                            key={role.id}
                            changed={hasPermissionChanged(role, leaf.code)}
                            description={PERMISSIONS[leaf.code]}
                            failed={failedRoleIds.has(role.id)}
                            granted={hasPermission(role, leaf.code)}
                            isScopeEnd={role.scope === "site" && role === siteRoles.at(-1)}
                            onToggle={() => toggle(role, leaf.code)}
                            role={role}
                            saving={saving}
                          />
                        ))}
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 right-0 z-30 hidden w-8 bg-linear-to-l from-card to-transparent lg:block xl:hidden"
              />
            </div>
          </section>
        </div>
      )}
    </>
  );
}
