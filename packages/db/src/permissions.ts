/**
 * 权限码与内置角色-权限映射常量表（SoT：docs/architecture-rbac-menu.md §1）。
 * 纯 TS、零依赖：前端经 `@next-build/db/permissions` 子路径 import（不连带 better-sqlite3）。
 * 权限码集合随代码演进，增删走代码评审；库里的 seeds 由 iam-seed.ts 按本表幂等同步。
 */

export const PERMISSIONS = {
  "project:read": "看项目列表/详情",
  "project:create": "创建项目",
  "project:update": "改项目信息",
  "project:delete": "删项目",
  "repo:manage": "项目挂载/移除仓库",
  "member:manage": "项目成员增删/改角色",
  "task:read": "看任务",
  "task:create": "创建/驱动任务",
  "wiki:read": "看 Wiki",
  "wiki:generate": "触发/更新 Wiki 生成",
  "ask:query": "Ask AI 提问",
  "user:manage": "用户列表、整站角色分配",
  "role:manage": "角色-权限映射配置",
} as const;

export type PermissionCode = keyof typeof PERMISSIONS;

/** 全部权限码数组（zod 校验等运行态场景用，避免各处重复 Object.keys）。 */
export const PERMISSION_CODES = Object.keys(PERMISSIONS) as [PermissionCode, ...PermissionCode[]];

export const SITE_ROLE_CODES = ["site:admin", "site:member", "site:viewer"] as const;
export const PROJECT_ROLE_CODES = ["project:owner", "project:member", "project:viewer"] as const;

export type SiteRoleCode = (typeof SITE_ROLE_CODES)[number];
export type ProjectRoleCode = (typeof PROJECT_ROLE_CODES)[number];
export type RoleCode = SiteRoleCode | ProjectRoleCode;

/** 内置角色定义（built_in=true，不可删；映射以代码为准，启动种子全量对齐）。 */
export const BUILTIN_ROLES: readonly { code: RoleCode; scope: "site" | "project"; name: string }[] = [
  { code: "site:admin", name: "整站管理员", scope: "site" },
  { code: "site:member", name: "整站成员", scope: "site" },
  // 只读整站角色本期预留（docs/architecture-rbac-menu.md §1.1）：全站只读 = 各读类权限。
  { code: "site:viewer", name: "整站只读", scope: "site" },
  { code: "project:owner", name: "项目负责人", scope: "project" },
  { code: "project:member", name: "项目成员", scope: "project" },
  { code: "project:viewer", name: "项目只读", scope: "project" },
];

const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as PermissionCode[];

/** 角色-权限映射（docs/architecture-rbac-menu.md §1.3 矩阵）。 */
export const ROLE_PERMISSIONS: Record<RoleCode, readonly PermissionCode[]> = {
  "site:admin": ALL_PERMISSIONS,
  "site:member": ["project:read", "project:create"],
  "site:viewer": ["project:read", "task:read", "wiki:read"],
  "project:owner": [
    "project:read",
    "project:update",
    "project:delete",
    "repo:manage",
    "member:manage",
    "task:read",
    "task:create",
    "wiki:read",
    "wiki:generate",
    "ask:query",
  ],
  "project:member": ["project:read", "task:read", "task:create", "wiki:read", "wiki:generate", "ask:query"],
  "project:viewer": ["project:read", "task:read", "wiki:read", "ask:query"],
};
