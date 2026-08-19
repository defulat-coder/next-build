# 后端架构（DDD）

> 落地于 `apps/web/server/`。本文是后端分层的 Source of Truth；规则摘要见 AGENTS.md「后端架构（DDD）」。

## 子域分析

按 PRODUCT.md 的功能规划划分子域（方法学：domain-driven-design skill 的子域分类门）：

| 子域 | 类别 | 说明 |
| --- | --- | --- |
| 任务（Task） | **核心域** | 任务即分支、沙箱执行、PR 产出——产品差异化所在 |
| 项目（Project） | 支撑域 | Project Brief、仓库工作区、治理策略、能力门禁与交付汇总 |
| Wiki 工作区 | 支撑域 | 围绕仓库的知识沉淀 |
| Ask AI | 支撑域 | 检索问答 |
| 认证（Auth） | 通用域 | 飞书登录、会话——现成模式，不产生差异化 |
| 权限（IAM） | 通用域 | 整站 + 项目两级 RBAC 授权、项目成员——设计见 `docs/architecture-rbac-menu.md` |

## 业务逻辑模式选择

按 skill 的选择门分上下文选择模式：

- **Project / Wiki / Ask / Auth / IAM**：支撑或通用域，继续使用 **事务脚本 + 端口与适配器**。Project 的主仓唯一性、替代删除、原子 owner 写入与 CAS 由数据库约束/事务脚本保护；不为这些规则引入富聚合。
- **Task**：核心域，已经存在任务状态机、稳定分支身份、一次任务多次执行尝试、交付完成定义等真实不变量，升级为 **领域模型 + 端口与适配器**。Task 是聚合根；TaskRun/Delivery 是任务生命周期内的实体/过程状态。
- **AcceptanceDecision**：属于 Task 核心域；它判定需求是否在目标环境满足，不属于 GitHub Delivery。代码合并只能把 Task 推进到 `acceptance_pending`。
- **交付流程**：sandbox → Agent → git push → Draft PR 是多步外部副作用，使用服务端持久化 **process manager**；不在浏览器执行，不使用跨上下文数据库事务。
- **可靠回流**：GitHub webhook 通过 HMAC 校验并写 inbox；Delivery/Task 状态与 `DeliveryMerged.v1` outbox 在同一 SQLite 事务提交。定时与手动 reconcile 产生同一种事实。
- 不采用 Event Sourcing：完整业务历史不是状态真相源。状态表是 Source of Truth，必要事实通过稳定事件/审计记录发布。

**后续升级门槛**：只有查询 fan-out/频率证明必要时才物化 ProjectDeliveryOverview 投影；第一版从同一 SQLite 中组装 detached read DTO，不预设 CQRS。

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
    project/                 # Project Brief/ProjectRepo/能力门禁；事务脚本
    task/                    # Task 聚合、TaskRun/Delivery 状态、TaskError、端口
    knowledge/               # KnowledgeGeneration 与已发布知识快照
  application/               # 应用层：用例（事务脚本）
    auth/
      login-with-feishu.ts   # 编排：换 token → 取资料 → upsertUser → 建会话
      logout.ts
      get-current-user.ts
    iam/                     # get-my-permissions / list-users / assign-site-role / project-member 增删改 / list-roles / update-role-permissions
    project/                 # Project Brief/lifecycle/archive/repository/capability use cases
    task/                    # create/list/get/retry/cancel/reconcile + process manager
                              # decide-acceptance：逐条标准、环境、证据与验收结论
    knowledge/               # generate/reconcile/publish/query generation
  infrastructure/            # 基础设施：外部世界适配器
    gateways/feishu-client.ts
    gateways/github-client.ts
    gateways/claude-agent-client.ts
    gateways/openwiki-client.ts
    workers/task-runner.ts
    workers/delivery-reconciler.ts
    workers/knowledge-runner.ts
  interface/                 # 接口层：HTTP 翻译，无业务逻辑
    http/auth.routes.ts
    http/auth-guard.ts
    http/cookies.ts
    http/project.routes.ts
    http/task.routes.ts
    http/knowledge.routes.ts
    http/github-webhook.routes.ts
```

- **interface**：HTTP 翻译——cookie、state 校验、重定向、状态码；无业务逻辑。
- **application**：用例（事务脚本）——编排端口完成一个用户目标；失败日志在用例打点。
- **domains**：限界上下文——Project 等薄上下文承载统一语言/错误/端口；Task 核心域承载显式状态决策与不变量。
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

## 跨上下文合同与协调

```text
IAM ──授权──> Project
Project ──ResolveExecutionTarget──> Task
Task ──命令──> Sandbox / Agent / GitHub Delivery
GitHub Delivery ──DeliveryMerged v1──> Knowledge
Knowledge ──PublishedGeneration──> Ask
```

- `ResolveExecutionTarget(projectId, projectRepoId)`：Task admission 使用，返回冻结的 providerRepoId、canonicalRepo、defaultBranch、baseSha、能力与 validationVersion；不泄漏 Project 内部模型。
- `TaskRunStatus(taskId)`：返回执行阶段、Delivery 状态、失败分类和允许的 retry/cancel/repair 动作。
- `ReconcileDelivery(taskId)`：幂等读取 GitHub 外部事实，更新本地 Delivery。
- `DeliveryMerged v1`：`taskId/projectId/projectRepoId/pr/mergeSha/mergedAt`，与 Delivery 本地状态同事务写 outbox，Knowledge 以系统身份幂等消费。
- `GenerateKnowledge(projectId, sourceSet, trigger)`：以 source fingerprint 幂等；全部仓成功后原子 promote。
- `GetPublishedKnowledge(projectId)`：只返回完整发布 generation；Ask 固定引用其 generationId。
- `DecideTaskAcceptance(taskId)`：仅已合并 Delivery 可执行；指定 reviewer 逐条确认 criteria，记录 environment/evidence/notes，产出 `business_accepted` 或 `rejected`。

完成语义严格分层：`execution_succeeded`（Draft PR）→ `delivery_merged`（代码合入）→ `business_accepted`（目标环境验收）→ `project_completed`（所有非取消任务已验收且项目成功标准满足）。

Task 流程选择 **orchestration | server-side process manager | durable forward recovery**。GitHub push/建 PR 等步骤没有可靠“撤销”，失败后优先查询外部状态并向前恢复；人工 repair 是终态之一。所有步骤携带 taskId/correlationId/idempotencyKey/attempt。

## 新上下文落地步骤

1. 先对照 PRODUCT.md 确认子域归属（核心/支撑/通用），拿不准就在 PR/提交说明里写理由。
2. 建 `server/domains/<ctx>/`：`model.ts`（核心概念）、`errors.ts`（判别联合 + kind）、`ports.ts`（消费的端口签名）。
3. 在 `server/application/<ctx>/` 写用例（事务脚本）：入参出参明确，返回 `Result`，失败打点。
4. 适配器进 `server/infrastructure/`（或新增 packages 窄接口）；HTTP 端点进 `server/interface/http/`。
5. 在 `server/composition-root.ts` 装配接线。
6. 同步补齐日志（生命周期 + 失败事件 + 关联字段）与用例单测（mock 端口）。
