# 产品规划：软件自动化研发平台

<!-- impeccable:product-schema 1 -->

> 本文档是当前阶段的功能规划（Source of Truth），尚未进入实现。改动规划请先改这里。

## Platform

web

## Users

内部小团队的开发者：飞书 OAuth 登录，每人一条用户记录；共用一套部署，不做角色权限。各自在仓库上创建任务、生成 Wiki、向代码提问。

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

- **项目（Project）**：仓库的容器（1:N），任务与 Wiki 的归属单位。项目下可配置多个 GitHub 仓库，其仓库集即生成 Wiki 的工作区。
- **任务（Task）**：平台的一等公民。每个任务绑定一个 Git 仓库、一个 Git 分支和一段 Agent 会话，围绕任务组织对话、代码变动与产出。

## 功能规划

### 1. 创建任务

创建任务后，通过 Claude Agent SDK 驱动 Agent 完成需求。

- 每个任务在 **microsandbox**（开源自托管 microVM 沙箱）中运行，任务创建时将指定的 GitHub 仓库克隆进沙箱。沙箱层收口为窄接口（创建/执行/读文件/销毁），microsandbox 是第一个实现，便于将来替换。
- 每个任务对应**一个独立的 Git 分支**（任务即分支，命名 `agent/<任务名>`）。
- Agent 在沙箱内可以操作文件、执行 Git 命令并提交。
- 任务完成后**自动 push 任务分支并开 Draft PR**；**合入 main 必须由人在 GitHub 上操作**（配合 main 分支保护，Agent 无权直接推送主分支）。
- 代码变动的存储与审阅完全依托 GitHub（分支 + PR diff），不把代码变动存进数据库。
- 任务列表通过 GitHub API 枚举 `agent/` 前缀的 PR 获得。

### 2. 项目管理

项目是可挂多个 GitHub 仓库的组，任务与 Wiki 的共同容器。

- 项目可配置多个 GitHub 仓库（`owner/repo`，添加时经 GitHub API 校验存在性与可访问性，记录默认分支）。
- 任务创建时先选项目再选仓库；Wiki 以项目为单位生成（其仓库集即工作区）。

### 3. 仓库 Wiki

以**项目**为单位生成 Wiki：项目的仓库集即工作区，对项目内配置的多个仓库整体生成文档。

- Wiki 生成使用 LangChain 开源的 **[OpenWiki](https://github.com/langchain-ai/openwiki) CLI**（本地运行，产出为 Markdown 文件，支持代码变更后增量更新）。弃用 Z Read。
- **源文件与 Wiki 文档一起入库**（本地 SQLite），页面端从库中读取渲染。
- 入库前过滤文件：排除 lock 文件、二进制、构建产物、minified 文件；超大文件截断或跳过。
- 源文件在库中只是**只读镜像**，GitHub 仍是真相源，重新生成时整体覆盖。
- 数据层收口为接口：本地实现为 SQLite，将来部署服务器时再换 Supabase/Postgres。

### 4. Ask AI

基于库中的 Wiki 文档和源文件做问答（简化 RAG）：

- 检索层用 SQLite **FTS5 全文检索**，`unicode61`（英文/代码标识符）+ `trigram`（中文子串）双索引合并排序。
- 已知限制：trigram 要求查询词 ≥3 个字符；查询词中的 `-` 等符号需清洗后再 MATCH。
- 检索结果拼装为上下文交给 Claude 回答；后期需要语义检索时再引入向量（本地可用 sqlite-vec，服务器侧 pgvector）。

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
- ~~Wiki 的「工作区」概念~~ → 已定：工作区即项目的仓库集；项目（仓库组，1:N）是任务与 Wiki 的归属单位，项目管理（项目 CRUD + 仓库配置 + GitHub 校验）先行落地，任务选项目/Wiki 接 OpenWiki 是下一棒。
- ~~Wiki 生成是调用 Z Read 外部服务还是自建管线~~ → 已定：OpenWiki CLI。待验证：OpenWiki 对多仓库工作区的支持方式（可能需按仓库分别生成再合并）。
- ~~任务工作区的存放位置与并发隔离策略~~ → 已定：microsandbox 本地/自托管沙箱，任务间以独立 microVM 隔离；Vercel 部署方案搁置。
- ~~是否需要多用户与权限体系~~ → 已定：飞书 OAuth 登录，每个登录人创建一条用户记录，整站保护（除 /login 与 OAuth 回调外页面和 API 都要求登录）；共用一套部署，不做角色权限。
