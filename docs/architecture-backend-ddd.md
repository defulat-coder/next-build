# 后端架构（DDD）

> 落地于 `apps/web/server/`。本文是后端分层的 Source of Truth；规则摘要见 AGENTS.md「后端架构（DDD）」。

## 子域分析

按 PRODUCT.md 的功能规划划分子域（方法学：domain-driven-design skill 的子域分类门）：

| 子域 | 类别 | 说明 |
| --- | --- | --- |
| 任务（Task） | **核心域** | 任务即分支、沙箱执行、PR 产出——产品差异化所在 |
| Wiki 工作区 | 支撑域 | 围绕仓库的知识沉淀 |
| Ask AI | 支撑域 | 检索问答 |
| 认证（Auth） | 通用域 | 飞书登录、会话——现成模式，不产生差异化 |
| 权限（IAM） | 通用域 | 整站 + 项目两级 RBAC 授权、项目成员——设计见 `docs/architecture-rbac-menu.md` |

## 业务逻辑模式选择

按 skill 的选择门：当前各领域逻辑都薄（编排外部调用为主，无复杂不变量），选 **事务脚本（Transaction Script）+ 端口与适配器**——用例函数编排端口，不引入聚合/领域事件/CQRS 等重型战术模式。

**升级门槛**：任务域将来出现需要事务保护的不变量（任务状态机、分支唯一性）时，再对**那一个上下文**升级为领域模型，其余上下文不动。升级需在 PR/提交说明里论证，并更新本文档。

## 四层职责

```
apps/web/server/
  composition-root.ts        # 组合根：建 db/logger/store/gateway 实例并接线
  domains/                   # 领域层：限界上下文即目录
    auth/
      model.ts               # AuthUser 等核心概念（统一语言的载体）
      errors.ts              # AuthError 判别联合（带 kind: business/system）
      ports.ts               # 本上下文消费的端口签名（引用 packages 窄接口）
    iam/                     # 授权上下文（RBAC）：Role/Permission/ProjectMember、IamError、IamStore 端口
    project/                 # 同上：Project/ProjectRepo、ProjectError、ProjectStore/GitHubGateway
  application/               # 应用层：用例（事务脚本）
    auth/
      login-with-feishu.ts   # 编排：换 token → 取资料 → upsertUser → 建会话
      logout.ts
      get-current-user.ts
    iam/                     # get-my-permissions / list-users / assign-site-role / project-member 增删改 / list-roles / update-role-permissions
    project/                 # create-project / list-projects / get-project / delete-project / add-repo / remove-repo
  infrastructure/            # 基础设施：外部世界适配器
    gateways/feishu-client.ts
    gateways/github-client.ts
  interface/                 # 接口层：HTTP 翻译，无业务逻辑
    http/auth.routes.ts
    http/auth-guard.ts
    http/cookies.ts
    http/project.routes.ts
```

- **interface**：HTTP 翻译——cookie、state 校验、重定向、状态码；无业务逻辑。
- **application**：用例（事务脚本）——编排端口完成一个用户目标；失败日志在用例打点。
- **domains**：限界上下文——核心概念（model）、错误判别联合（errors，带 `kind: "business" | "system"`）、本上下文消费的端口签名（ports）。
- **infrastructure**：外部世界适配器——实现 domains 声明的端口（飞书 OAuth 网关等）。

## 依赖方向

```
interface → application → domains ← infrastructure ← packages（适配器实现）
```

- 只许沿箭头方向依赖；domains 不依赖任何外层。
- 端口契约留在 `packages/*` 的窄接口里（`AuthStore` / `DocStore` / `SandboxProvider`），domains 的 ports.ts 引用而不重复定义。
- `packages/db`（持久化适配器）、`packages/sandbox`（执行环境适配器）、`packages/result`（共享内核 Shared Kernel）；业务规则不进 packages。

## 与异常/日志约定的咬合

- 错误判别联合带 `kind` 归 `domains/<ctx>/errors.ts`：`business`（用户可行动，warn，message 可透传）/ `system`（基础设施故障，error，API 不透传细节）。
- 数据层错误（`DbError`）在用例里经 `authErrorFromDb` 之类的翻译函数转为本上下文的 system 异常。
- 日志在产生层打点：用例记业务生命周期事件（`auth.login` / `auth.failed`），适配器记外部调用失败（`db.error`），路由只管 HTTP 语义。

## 新上下文落地步骤

1. 先对照 PRODUCT.md 确认子域归属（核心/支撑/通用），拿不准就在 PR/提交说明里写理由。
2. 建 `server/domains/<ctx>/`：`model.ts`（核心概念）、`errors.ts`（判别联合 + kind）、`ports.ts`（消费的端口签名）。
3. 在 `server/application/<ctx>/` 写用例（事务脚本）：入参出参明确，返回 `Result`，失败打点。
4. 适配器进 `server/infrastructure/`（或新增 packages 窄接口）；HTTP 端点进 `server/interface/http/`。
5. 在 `server/composition-root.ts` 装配接线。
6. 同步补齐日志（生命周期 + 失败事件 + 关联字段）与用例单测（mock 端口）。
