# 产品规划：软件自动化研发平台

<!-- impeccable:product-schema 1 -->

> 本文档是产品行为与后续规划的 Source of Truth。已实现能力和下一阶段设计都必须先在这里对齐。

## Platform

web

## Users

内部小团队的开发者：飞书 OAuth 登录，每人一条用户记录；共用一套部署，做两级 RBAC 角色权限（整站级 admin/member + 项目级 owner/member/viewer），设计见 `docs/architecture-rbac-menu.md`。各自在仓库上创建任务、生成 Wiki、向代码提问。

## Product Purpose

让 AI Agent 以**任务**为单位完成真实的研发工作：任务绑定仓库、分支与 Agent 会话，产出以代码分支 + Draft PR 交付，由人审核合并；并围绕仓库沉淀 Wiki 与问答能力，让小团队持续理解自己的代码。

## Positioning

两个邻近产品无法照抄的定位点：

1. **人工 merge 把关 + 本地优先**：Agent 产出一律走 Draft PR，人永远握着 merge 键；数据与执行环境不出自己的机器/服务器。
2. **任务中心视角**：以任务组织对话、代码变动与知识沉淀，而非以对话（Chat 类产品）或仓库（DeepWiki 类产品）为中心。

## Operating Context

本地/自有服务器运行（当前 macOS 开发机）；工作流依托 GitHub（克隆、任务分支、Draft PR、人工 merge）；沙箱为本地 microsandbox 服务；Wiki 由 OpenWiki CLI 生成；数据存本地 SQLite。设计参考项目：`/Users/xbjt/seas/seas/xibo-seas-front/`（布局与控件）、`/Users/xbjt/Documents/myself/personal-sites`（主题与字体）。

## Brand Commitments

产品名 **Next Build**，工具感，不做品牌包装。

## Evidence on Hand

- 设计参考实现：上述两个本地项目（布局规范与主题 token 的直接证据）。
- 无用户数据、案例、评价；未来任何页面不得虚构这些数据。

## Product Principles

- 人始终握着 merge 键：Agent 产出必须经人工审核才能进入主干。
- 任务即分支：一切围绕任务组织，不围绕对话或仓库。
- 本地优先：先保证本机可运行，外部服务与部署延后。
- 代码的归宿是 Git：代码变动以分支/PR 形式存在，不进数据库。
- 外部依赖收口为窄接口：沙箱、数据层均可替换实现。

## 定位

一个以**任务**为核心视角的软件自动化研发平台。前端、后端全部为 TypeScript。底座基于 [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript)（Node 版 `@anthropic-ai/claude-agent-sdk`），通过对话驱动 Agent 完成代码研发工作。

## 核心概念

- **项目（Project）**：轻量交付 Brief + 仓库工作区 + 治理策略 + 交付汇总。项目不承载具体执行状态；Task/Delivery/Knowledge 通过稳定合同归属项目。
- **任务（Task）**：平台的一等公民，保存需求、范围、验收标准与稳定执行目标。
- **任务执行（TaskRun）**：一次可恢复的 Agent 执行尝试，保存沙箱、Agent 会话、阶段、心跳、失败与重试信息。
- **交付（Delivery）**：任务在 GitHub 的分支、Draft PR、评审与 merge 状态；GitHub 是代码/PR 真相源，本地保存映射和过程状态。
- **知识生成（KnowledgeGeneration）**：项目 Wiki/源文件的一次版本化生成；只有完整发布的 generation 可供 Wiki 与 Ask 使用。
- **业务验收（AcceptanceDecision）**：指定验收人基于任务验收标准，对已合并交付逐项给出通过/拒绝结论和证据；它与代码 merge 是两个不同事实。

## 端到端交付主线

平台的完成定义固定为：

`业务需求 → Project Brief → Task 验收合同 → Agent 执行 → 技术验证 → Draft PR → 人工评审/合并 → 目标环境验证 → 业务验收 → Project 完成/复盘`

- `execution_succeeded`：Agent 已完成技术工作、验证命令通过且 Draft PR 已建立。
- `delivery_merged`：代码已由人合入目标分支。
- `business_accepted`：指定验收人逐条确认业务标准，保存目标环境、证据、结论、备注与时间。
- `project_completed`：项目成功标准满足，且所有非取消交付都已业务验收；不能由一个未校验的设置项直接宣告。
- Merge 不是最终产品交付。需要发布/部署的平台必须在业务验收前记录目标环境与可访问证据；自动 Deployment/rollback 接入按部署提供方逐个实现，首版允许人工提供环境和证据。

## 功能规划

### 1. 创建任务

创建任务时必须提交一份验收合同：目标/用户故事、范围、非目标、可勾选验收标准、预期验证命令、风险/影响路径与 reviewer。创建成功后，通过 Claude Agent SDK 驱动 Agent 完成需求。

- Task 本地持久化 `projectId`、`projectRepoId`、需求/验收、创建人、reviewer 与 idempotency key；不保存代码 diff。
- Task 创建必须经 `ResolveExecutionTarget(projectId, projectRepoId)` admission：重新校验所选仓库，冻结 provider repo id、规范仓库名、默认分支、base SHA 与校验版本；项目列表上的旧 `ready` 不是执行凭证。
- 每个任务在 **microsandbox** 中运行；TaskRun 记录 `queued → provisioning → running → publishing → succeeded | failed | cancelled | manual_repair`，并保存 sandboxRef、agentSessionId、attempt、heartbeat、deadline 与错误。
- 每个任务对应**一个稳定唯一分支**：`agent/<short-task-id>-<slug>`；重试复用同一任务身份，不按可变任务名寻找分支。
- Delivery 独立记录 `none → branch_pushed → draft_pr_open → ready_for_review → merged | closed_unmerged`，保存 PR id/url、base/head/merged SHA。
- Agent 在沙箱内可以操作文件、执行 Git 命令并提交；完成后自动 push 任务分支并开 Draft PR。
- `execution_succeeded` 表示 Draft PR 已建立；`delivery_merged` 表示 PR 已由人合并；`business_accepted` 才表示任务完成。**合入 main 必须由人在 GitHub 上操作**。
- GitHub webhook 驱动 PR/merge 回流，定时或手动 reconcile 兜底；重复事件按 Delivery/PR id 幂等消费。
- 服务端持久化 process manager 负责 resume/retry/cancel/repair、有限技术重试和孤儿沙箱清理；浏览器不承载 durable workflow。
- Agent 完成时生成 Delivery Summary：改动、未完成项、验证命令与结果、证据、已知风险；required checks 通过后才进入 review。
- 合并后 Task 进入 `acceptance_pending`；只有指定 reviewer 或具有验收权限的管理员可以提交 AcceptanceDecision。拒绝后必须创建后续修复任务或显式关闭，不允许把 rejected 当作 completed。

### 2. 项目管理

项目是任务与 Wiki 的治理边界。创建时保持轻量，但项目详情必须补齐 Brief：问题陈述、期望结果、成功标准、非目标、负责人、目标日期、约束与参考链接。首次流程为「创建项目 → 完善 Brief → 配置首仓 → 自动设为主仓 → 能力门禁通过」。

项目有两个正交维度：

- 生命周期：`planned | active | blocked | completed | archived`；进入 completed 必须通过项目完成策略。
- 工作区就绪度：`setup_required | ready | needs_attention`。

已归档项目只读、可搜索、可恢复。普通终止动作是归档；只有没有 Task/Delivery/Knowledge 历史的空项目允许物理删除。

#### 2.1 就绪状态

- `setup_required`（待配置）：项目还没有仓库。
- `ready`（已就绪）：主仓库最近一次 metadata 校验可访问。
- `needs_attention`（需处理）：主仓库不可访问或工作区状态不完整。
- 项目列表展示名称、描述、状态、仓库数与主仓库；创建项目成功后直接进入该项目的仓库配置页。
- 健康状态只描述配置基础，不等于 Task/Wiki/Ask 都能执行。能力门禁分别为 `taskEligibility(repoId)`、`wikiEligibility`、`askEligibility`，页面展示具体阻断项。
- 项目概览最终展示 ProjectDeliveryOverview：Brief 完整度、能力门禁、活跃/失败 TaskRun、待审/已合并 Delivery、Wiki generation freshness、最近活动与下一步。

#### 2.2 仓库配置

- 项目可配置多个 GitHub 仓库，仓库可同时出现在多个项目中；输入接受 `owner/repo` 或 GitHub URL，仍使用服务端 `GITHUB_TOKEN` 校验。
- 首个仓库自动成为主仓库。仓库记录包含规范仓库名、默认分支、主仓标识、访问状态（`available | unavailable`）与最后校验时间。
- 仅 `available` 仓库能被用户主动设为主仓。删除最后一个仓库后项目回到 `setup_required`；删除主仓且仍有其他仓库时，必须显式选择一个 `available` 替代主仓，并在同一数据库事务内完成切换与删除。
- 重新校验成功时刷新 GitHub 返回的规范仓库名、默认分支、访问状态与校验时间；GitHub 404（包含私有仓库无权限的等价响应）保留仓库记录并标记为 `unavailable`；网络失败或限流不覆盖旧状态。
- 仓库记录补 provider repository id 与 version；Task admission 再验证 metadataReadable/cloneable/pushable/prCreatable 并获取 base SHA。校验结果有 freshness TTL，不能无限期假绿。
- 仓库从项目移除采用 detach/soft delete；已有 Task/Delivery/Knowledge 继续引用冻结执行目标和历史仓库身份。
- 仓库页的空状态直接提供输入框；非空列表展示默认分支、主仓标识、访问状态和最后校验时间，并按当前项目权限提供「设为主仓 / 重新校验 / 移除」。

#### 2.3 项目设置与权限

- 设置页提供 Brief、生命周期、名称/描述、负责人和项目默认策略；Archive 是主操作，物理删除仅用于空项目。
- 项目详情读取必须通过 `project:read`；项目内操作必须按当前 `projectId` 判断权限，不能用其他项目的同名权限误显示操作。
- 项目必须至少显示只读负责人/成员；成员管理继续复用 IAM 上下文，Task reviewer 单独记录。
- 创建项目与写入 owner 必须同一事务或有可靠补偿，命令支持 idempotency key；项目/仓库更新使用 version/CAS，冲突返回可行动的 409。
- 任务创建时先选项目再选仓库，并消费 `taskEligibility(repoId)`；Wiki/Ask 消费各自门禁，不共享一个粗粒度绿灯。

### 3. 仓库 Wiki

以**项目**为单位生成 Wiki：项目的仓库集即工作区，对项目内配置的多个仓库整体生成版本化知识快照。

- Wiki 生成使用 LangChain 开源的 **[OpenWiki](https://github.com/langchain-ai/openwiki) CLI**（本地运行，产出为 Markdown 文件，支持代码变更后增量更新）。弃用 Z Read。
- `KnowledgeGeneration` 保存 generation id、项目、来源仓库与 SHA 集、状态、trigger、开始/发布时间和错误。
- 生成先写 staging generation，全部完成后原子 promote；失败继续服务上一成功版本，禁止 Wiki 与源码半新半旧。
- 多仓 generation 默认 all-or-nothing；若将来支持 partial，必须在 Wiki/Ask 明确显示缺失仓库。
- **源文件与 Wiki 文档一起入库**（本地 SQLite），页面只读取已 published generation。
- 入库前过滤文件：排除 lock 文件、二进制、构建产物、minified 文件；超大文件截断或跳过。
- 源文件在库中只是**只读镜像**，GitHub 仍是真相源，重新生成时整体覆盖。
- `DeliveryMerged v1` 事件携带 task/project/projectRepo/PR/mergeSha/mergedAt，标记知识过期并触发可恢复刷新。
- 数据层收口为接口：本地实现为 SQLite，将来部署服务器时再换 Supabase/Postgres。

### 4. Ask AI

基于已发布 KnowledgeGeneration 中的 Wiki 文档和源文件做问答（简化 RAG）：

- 检索层用 SQLite **FTS5 全文检索**，`unicode61`（英文/代码标识符）+ `trigram`（中文子串）双索引合并排序。
- 已知限制：trigram 要求查询词 ≥3 个字符；查询词中的 `-` 等符号需清洗后再 MATCH。
- 检索结果拼装为上下文交给 Claude 回答；后期需要语义检索时再引入向量（本地可用 sqlite-vec，服务器侧 pgvector）。
- 每次回答固定引用一个 published generation，并返回 `asOf`、source SHAs 与 stale/partial 状态；没有成功 generation 时 `askEligibility` 阻断。

### 5. 智能问书

> 暂缓设计：功能边界、输入输出、与 Ask AI 的关系尚未明确，本轮不做。

## UI 设计参考

界面布局与交互风格参考 `/Users/xbjt/seas/seas/xibo-seas-front/`（SEAS 前端），**只参考其显示层设计**，技术栈以本仓库为准（Next.js 16 + Tailwind v4 稳定版 + shadcn 体系）。

布局骨架（Lovart 风格悬浮栏）：

- 根容器 `h-screen overflow-hidden`；**悬浮侧边栏** `fixed` 定位不占流，36×36 纯图标 `rounded-xl`，毛玻璃卡片 `bg-card/90 backdrop-blur-xl shadow-xl`，hover 出 tooltip，选中项 `bg-primary`。
- 顶栏 `h-14 border-b sticky top-0 z-40`：左 Logo + 胶囊搜索框（focus 变宽），右侧主 CTA → 主题切换/通知/用户菜单。
- 内容区 `flex-1 overflow-auto p-6 pl-[72px]`（左侧给悬浮栏留位）；列表用卡片网格 `grid md:grid-cols-2 lg:grid-cols-3 gap-4`，卡片 `rounded-xl border p-4 hover:shadow-lg`。

控件规范：

- 按钮统一 `rounded-full` + `text-sm font-bold`，variant：default（`bg-primary`）/ secondary / destructive / outline / ghost / link；确认对话框固定「outline 取消 + destructive 执行」组合；加载态用 `loading` prop。
- 输入框 `h-10 rounded-full`，focus = `border-primary` + `ring-primary/20`。
- Badge/标签一律「10% 透明度背景 + 全色文字」胶囊：`bg-<语义色>/10 text-<语义色>`。
- 颜色只用语义 token（`bg-background / bg-card / bg-primary / text-muted-foreground / border-border`），禁止硬编码 hex。
- 微交互：hover `scale(1.05)`、tap `scale(0.95)`、按钮 `active:scale(0.98)`；尊重 `prefers-reduced-motion`。

设计基调：**浅色优先的极简灰阶**（参考 personal-sites / Apple 风格：白底 + 墨色文字 `#1c1c1e` + 细灰线 `#eee`，无强调色、链接即墨色、SF Pro 系统字体栈、紧凑字距）；深色为中性灰 `#181818`（非黑蓝）。主题经 `<html data-theme>` + localStorage 切换，默认跟随系统，layout 内联脚本防首帧闪烁。token 用 Tailwind v4 的 `@theme` CSS-first 方式定义在全局 CSS 中（与本仓库现有方式一致，无需 tailwind.config 翻译）。

## 技术底座

仓库形态：**pnpm monorepo**（已落地）：

- `apps/web` — Next.js 16 全栈应用（前端 + Hono API）
- `packages/db` — 数据层：窄接口 + better-sqlite3/FTS5 本地实现（当前仅接口契约）
- `packages/sandbox` — 沙箱层：窄接口（创建/执行/读文件/销毁）+ microsandbox 实现（当前仅接口契约）

技术选型：

- Web 框架：Next.js 16 + React 19 + TypeScript（当前仓库骨架已就绪）。
- 后端框架：Hono（轻量、TS 类型友好，挂载在 Next Route Handler 下），配 zod 做 schema 校验。
- Agent 运行时：`@anthropic-ai/claude-agent-sdk`（Node SDK，驱动 Claude Code 的 agent 运行时）。
- 任务工作区：[microsandbox](https://github.com/superradcompany/microsandbox)（开源 microVM 沙箱，自托管服务器 + JS SDK；本地开发与将来服务器部署同一套）。
- Wiki 生成：OpenWiki CLI（npm 包 `openwiki`，Node/TS，基于 DeepAgents；当前 0.3.x，API 未稳定，锁版本）。
- 数据层：better-sqlite3 + FTS5 + Drizzle ORM（本地唯一数据库；FTS5 虚表用原生 SQL 建，常规表走 Drizzle schema；远程库/Supabase 本期不设计，后续再说）。
- 后端架构：DDD 四层（interface/application/domains/infrastructure，`apps/web/server/`），事务脚本 + 端口适配器（见 `docs/architecture-backend-ddd.md`）。
- 运行策略：**本地优先**——项目先保证本机可运行，部署到 Vercel 等外部上传环节延后。
- 对话流式传输：Vercel AI SDK（`ai`）。
- 异常处理：Result 类型方案（skill：`web-error-handling-result-types`）——预期错误作为值返回、非预期错误才 throw；共享零依赖小包 `@next-build/result`；API 边界统一翻译为结构化错误响应。
- 日志：pino 结构化日志（skill：`structured-logging-lite`）——事件名 + 固定字段契约，`task_id` 全链路关联，packages 只依赖注入的 Logger 接口。
- 尚未引入，落地时需要补充：diff 渲染组件；向量检索（sqlite-vec / pgvector）与 Embedding 方案。

## 开放问题

- ~~「智能问书」~~ → 暂缓设计，本轮不做。
- ~~Wiki 的「工作区」概念~~ → 已定：工作区即项目仓库集；Project 提供治理/能力门禁，Task 与 Knowledge 通过稳定合同消费，不能直接读取 ProjectStore 内部模型。
- ~~Wiki 生成是调用 Z Read 外部服务还是自建管线~~ → 已定：OpenWiki CLI。第一版多仓按仓库分别生成后合并为一个 generation，all-or-nothing 原子发布；partial 模式后置。
- ~~任务工作区的存放位置与并发隔离策略~~ → 已定：microsandbox 本地/自托管沙箱，任务间以独立 microVM 隔离；Vercel 部署方案搁置。
- ~~是否需要多用户与权限体系~~ → 已定：飞书 OAuth 登录，每个登录人创建一条用户记录，整站保护（除 /login 与 OAuth 回调外页面和 API 都要求登录）；共用一套部署，做**两级 RBAC**（整站级 + 项目级角色），菜单按权限码过滤，完整设计见 `docs/architecture-rbac-menu.md`。
- Delivery merge webhook 的公网入口与签名密钥由部署环境配置；本地无公网回调时使用定时 reconcile + 手动同步兜底。
