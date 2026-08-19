# 权限（RBAC）与菜单设计

> 本文是权限体系与菜单可见性规则的 Source of Truth，已落地实现（packages/db `iam-store`/`permissions` + `apps/web/server/{domains,application,interface}/iam` + 前端权限过滤与 `/admin/users`）。改动设计先改本文。
>
> 关联文档：产品决策见 `PRODUCT.md`「Users」；分层归位见 `docs/architecture-backend-ddd.md`；错误/日志约定见 `docs/architecture-error-handling.md` 与 AGENTS.md。

## 1. 模型：标准 RBAC0，两级角色

```text
用户 ──< 用户-整站角色 >── 整站角色 ──< 角色-权限 >── 权限码
用户 ──< 项目成员（含项目角色）>── 项目角色 ──< 角色-权限 >── 权限码
```

- **权限码**为 `<资源>:<动作>` 字符串常量，定义在代码里（`packages/db` 或 `domains/iam` 的常量表），不是运行时配置。权限码集合随代码演进，增删走代码评审。
- **两级角色**：整站角色决定「能在平台做什么」，项目角色决定「能在某个项目里做什么」。项目内动作一律带 `projectId` 判定，整站角色不渗透进项目（`admin` 除外）。
- **判定规则**：有效权限 = 整站角色权限 ∪ 项目角色权限（按 projectId 上下文求并集）；`admin` 短路全放行。

### 1.1 整站角色（site scope）

| 角色 | code | 说明 |
| --- | --- | --- |
| 整站管理员 | `site:admin` | 全量权限 + 用户/角色管理；第一个注册用户自动获得 |
| 整站成员 | `site:member` | 默认角色：可创建项目、参与被拉入的项目 |
| 整站只读（预留） | `site:viewer` | 全站只读；本期不启用，表结构与映射预留 |

### 1.2 项目角色（project scope）

| 角色 | code | 说明 |
| --- | --- | --- |
| 项目负责人 | `project:owner` | 项目创建者自动获得：仓库配置、成员管理、删项目 |
| 项目成员 | `project:member` | 建任务、触发 Wiki 生成、Ask AI |
| 项目只读 | `project:viewer` | 项目内只读 |

### 1.3 权限码清单（初版）

| 权限码 | 说明 | 整站管理员<br>`site:admin` | 整站成员<br>`site:member` | 整站只读<br>`site:viewer` | 项目负责人<br>`project:owner` | 项目成员<br>`project:member` | 项目只读<br>`project:viewer` |
| --- | --- | :-: | :-: | :-: | :-: | :-: | :-: |
| `project:read` | 看项目列表/详情 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `project:create` | 创建项目 | ✓ | ✓ | — | — | — | — |
| `project:update` | 改项目信息 | ✓ | — | — | ✓ | — | — |
| `project:delete` | 删项目 | ✓ | — | — | ✓ | — | — |
| `repo:manage` | 项目挂载/移除仓库 | ✓ | — | — | ✓ | — | — |
| `member:manage` | 项目成员增删/改角色 | ✓ | — | — | ✓ | — | — |
| `task:read` | 看任务 | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| `task:create` | 创建/驱动任务 | ✓ | — | — | ✓ | ✓ | — |
| `wiki:read` | 看 Wiki | ✓ | — | ✓ | ✓ | ✓ | ✓ |
| `wiki:generate` | 触发/更新 Wiki 生成 | ✓ | — | — | ✓ | ✓ | — |
| `ask:query` | Ask AI 提问 | ✓ | — | — | ✓ | ✓ | ✓ |
| `user:manage` | 用户列表、整站角色分配 | ✓ | — | — | — | — | — |
| `role:manage` | 角色-权限映射配置 | ✓ | — | — | — | — | — |

规则说明：

- 整站 `member` 的项目内权限完全来自 `project_members` 中的项目角色；未被拉进任何项目时只能创建项目和看到自己参与的内容。
- 带 `—` 的格子表示该 scope 的角色不持有此权限（如 `project:create` 是整站级权限，项目角色永远不会有）。
- 「角色与权限」管理页将权限叶子放在单一矩阵中，按「整站角色／项目角色」分组显示；矩阵上方可收起资源目录（项目 → 仓库 / 成员，知识与问答 → Wiki 等），目录仅控制显示，只有权限叶子可编辑。
- 项目列表对非 admin 只返回「我创建的 ∪ 我是成员的」项目，过滤在应用层做，不靠前端藏。

## 2. 数据模型

落在 `packages/db/src/schema.ts`（Drizzle），常规表走 Drizzle schema，与现有表风格一致。

| 表 | 字段 | 约束 |
| --- | --- | --- |
| `roles` | `id` PK、`code` unique（如 `site:admin`）、`scope`（`site`/`project`）、`name`、`built_in` | 内置角色 `built_in=true`，不可删 |
| `permissions` | `code` PK、`description` | 与代码常量表对齐，启动时同步种子 |
| `role_permissions` | `role_id` + `permission_code` 联合主键 | 级联删 |
| `user_site_roles` | `user_id`（唯一索引）+ `role_id` | 一人一个整站角色 |
| `project_members` | `project_id` + `user_id` 联合主键、`role_id`、`added_at` | 随项目级联删 |

补充规则：

- 既有 `projects.created_by` 保留作审计字段；**权限判定以 `project_members` 为准**，不看 `created_by`。
- **引导（bootstrap）**：**默认登录即全权限**——新注册用户一律默认 `site:admin`（含库内第一个用户）；创建项目时用例把创建者写入 `project_members`（`project:owner`）。既有 `site:member` 用户由种子迁移一次性提升为 `site:admin`，之后管理员在管理页的调整不再被种子覆盖。
- 角色-权限映射**入库**（种子数据兜底），并可在「角色与权限」管理页（`/admin/roles`，`role:manage`）按角色勾选配置；`built_in` 角色不可删，但其权限映射可改（`site:admin` 因短路规则实际恒为全权限，改其映射无效果，页面置灰提示）。

## 3. DDD 归位

授权（authorization）是独立限界上下文 **`iam`**（通用域），与负责认证（authentication）的 `auth` 上下文分开：

```text
server/domains/iam/
  model.ts    # Role / Permission / ProjectMember（统一语言）
  errors.ts   # IamError 判别联合（见 §5）
  ports.ts    # 本上下文消费的 IamStore 端口签名（归口 re-export packages/db 窄接口）
server/application/iam/
  get-my-permissions.ts      # 当前用户权限码全集（整站 ∪ 各项目）
  list-users.ts              # 用户列表（user:manage）
  assign-site-role.ts        # 分配整站角色（user:manage）
  add-project-member.ts      # 拉人进项目（member:manage）
  update-project-member.ts   # 改项目角色（member:manage）
  remove-project-member.ts   # 移出项目（member:manage）
  list-roles.ts              # 角色列表（含各角色权限码，role:manage）
  update-role-permissions.ts # 按角色全量替换权限映射（role:manage）
server/interface/http/
  iam.routes.ts              # /api/me/permissions、/api/admin/users、/api/admin/roles、/api/projects/:id/members
  permission-guard.ts        # 权限中间件（见 §4）
```

- 端口契约 `IamStore` 进 `packages/db` 窄接口：`getSiteRole(userId)`、`getProjectRole(userId, projectId)`、`getPermissionsForUser(userId)`、`assignSiteRole`、`upsertProjectMember`、`removeProjectMember`、`listUsersWithRoles`、`listRolesWithPermissions`、`setRolePermissions` 等；业务规则不进 packages。
- 其他上下文的用例（project/task/wiki）做项目级判定时，通过组合根注入的 `IamStore` 查询，不直接跨上下文 import 实现。

## 4. 强制点（三层防线）

菜单隐藏只是体验层，真正的防线在服务端。

1. **API 层（主防线）**：`permission-guard.ts` 中间件，路由声明所需权限码（如 `POST /api/projects` → `project:create`），不足返回 `403 { error: { code: "FORBIDDEN", message } }`。
   - 整站级权限在中间件判定（只需 userId）。
   - 项目级权限在**用例内**判定：用例从入参取 `projectId`，调 `IamStore.getProjectRole` 判定——路由中间件不猜资源归属（如 `/api/tasks` 的 projectId 在 body 里）。
   - 权限解析一次请求只查一次：authGuard 之后把 `userId + 权限码集合` 放进 Hono context，中间件与用例共用。
2. **页面层**：`proxy.ts` 维持只判登录；页面级权限在 `(admin)` 布局的 server 组件校验（查 `/api/me/permissions` 等价的服务端函数），越权渲染 403 页（`app/(errors)` 错误页体系）。
3. **前端展示**：`GET /api/me/permissions` 返回当前用户权限码全集（登录态下一次性下发：整站权限 ∪ 各项目权限），前端 providers 缓存，驱动菜单过滤与按钮显隐。

## 5. 错误与日志

与 `docs/architecture-error-handling.md` 咬合：

- `IamError` 判别联合带 `kind`：
  - `FORBIDDEN`（business，403，message 面向用户，如「需要项目成员权限」）
  - `MEMBER_EXISTS`（business，409）
  - `MEMBER_NOT_FOUND`（business，404）
  - `LAST_OWNER`（business，项目至少保留一个 owner）
  - `LAST_ADMIN`（business，整站至少保留一名管理员，防止降级最后一个 admin 锁死管理入口）
  - `ROLE_NOT_FOUND`（business，404，角色不存在）
  - DB 失败经 `iamErrorFromDb` 翻译为 system
- 日志事件（pino，固定字段）：
  - `iam.site_role_assigned`（info）：`actor_id`、`target_user_id`、`role`
  - `iam.project_member_added` / `iam.project_member_removed` / `iam.project_member_updated`（info）：`actor_id`、`target_user_id`、`project_id`、`role`
  - `iam.role_permissions_updated`（info）：`actor_id`、`role`、`permissions`（角色-权限映射变更属审计事件）
  - `authz.denied`（warn）：`user_id`、`permission`、`path`；拒绝必须打点，不静默
- 角色与成员变更属审计事件，必记；不记录 token 等敏感信息。

## 6. 菜单设计（权限码过滤静态菜单）

菜单**不入库、不做管理后台**：结构仍定义在前端 `apps/web/data/sidebar-data.ts`，每个菜单项增加 `permission?: PermissionCode` 字段，渲染时按当前用户权限码过滤——无权限的项**不渲染**（而非置灰）。

### 6.1 菜单-权限映射

| 组 | 菜单 | 路径 | 权限码 | 备注 |
| --- | --- | --- | --- | --- |
| 产品 | 项目 | `/projects` | `project:read` | |
| 产品 | 任务 | `/tasks` | `task:read` | |
| 产品 | Wiki | `/wiki` | `wiki:read` | |
| 产品 | Ask AI | `/ask-ai` | `ask:query` | |
| 管理（新增） | 用户与角色 | `/admin/users` | `user:manage` | 整站 admin 专属 |
| 管理（新增） | 角色与权限 | `/admin/roles` | `role:manage` | 按角色勾选权限码矩阵 |
| 参考演示 | 任务表格、设置 | `/original/*` | 无权限码 | 仅 dev 环境显示（`process.env.NODE_ENV`） |

规则：

- 组内全部项被过滤时，整组（含组标题）不渲染。
- `admin` 持全量权限码，自然看到全部菜单，不为菜单写特判。
- ⌘K 命令面板的条目源与菜单同一份数据，同样按权限过滤。
- 前端过滤只是体验层；直接输 URL 会被 §4 的页面层与 API 层拦下。

### 6.2 实现形态（实现期参考）

```ts
// data/sidebar-data.ts（示意）
{
  title: "用户与角色",
  url: "/admin/users",
  icon: IconUsers,
  permission: "user:manage",
}
```

- `NavGroup` 渲染前过滤 `items.filter(item => !item.permission || permissions.has(item.permission))`。
- 权限码常量与后端共享：定义在 `packages/db`（或独立共享文件），前端经类型 import，不写魔法字符串。

## 7. 迁移与兼容（实现期执行）

- 既有 `site:member` 用户由 drizzle 一次性迁移（`0003_promote-members-to-admin`）提升为 `site:admin`——一次性由迁移日志保证，之后管理页的降级不被回放。
- 无整站角色的既有 `users` 由种子补默认角色 `site:admin`（与 §2 引导规则一致）。
- 既有 `projects` 按 `created_by` 回填 `project_members`（`project:owner`）。
- 种子数据幂等：启动时按 `code` upsert 角色/权限；`built_in` 角色**缺失的映射**由种子补齐，但不清空库内已有映射——管理页的配置优先于种子默认值。

## 8. 明确不做

- 菜单管理后台、菜单入库。
- 自定义新角色（只能配置内置角色的权限映射）；细粒度到单仓库、单任务的权限；权限委派/临时授权。
- 资源级 ACL（RBAC0 之外的复杂模型）。
