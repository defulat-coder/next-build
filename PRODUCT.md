# 产品规划：软件自动化研发平台

> 本文档是当前阶段的功能规划（Source of Truth），尚未进入实现。改动规划请先改这里。

## 定位

一个以**任务**为核心视角的软件自动化研发平台。底座基于 [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript)（Node 版 `@anthropic-ai/claude-agent-sdk`），通过对话驱动 Agent 完成代码研发工作。

## 核心概念

- **任务（Task）**：平台的一等公民。每个任务绑定一个 Git 仓库、一个 Git 分支和一段 Agent 会话，围绕任务组织对话、代码变动与产出。

## 功能规划

### 1. 创建任务

创建任务后，通过 Claude Agent SDK 与 Agent 对话来实现需求。

- 任务创建时将指定的 GitHub 仓库**克隆到本地**工作区。
- 开发过程中提供**代码变动面板**，实时查看工作区的 diff。
- Agent 在对话过程中可以操作文件、执行 Git 命令并提交。
- 每个任务对应**一个独立的 Git 分支**（任务即分支）。

### 2. 仓库 Wiki

对每个 Git 仓库生成对应的 Wiki，期望集成 **Z Read 的实现方式**（参考 [zread.ai](https://zread.ai) 的仓库文档化思路；具体是调用其能力还是自建同类实现，待定）。

### 3. Ask AI

基于生成的 Wiki 和仓库文件构建知识库，提供问答能力（RAG：Wiki 作为结构化知识，源文件作为事实依据）。

### 4. 智能问书

> 待补充：功能边界、输入输出、与 Ask AI 的关系尚未明确。

## 技术底座

- Web 框架：Next.js 16 + React 19 + TypeScript（当前仓库骨架已就绪）。
- Agent 运行时：`@anthropic-ai/claude-agent-sdk`（Node SDK，驱动 Claude Code 的 agent 运行时；尚未加入依赖，落地时安装）。
- 尚未引入，落地时需要补充：Git 操作库（待定，如 `simple-git` 或直接 spawn `git`）、diff 渲染组件、RAG 所需的向量存储与 Embedding 方案。

## 开放问题

- 「智能问书」的具体定义与范围。
- Wiki 生成是调用 Z Read 外部服务还是自建管线。
- 任务工作区的存放位置与并发隔离策略（本地目录 / 云沙箱）。
- 是否需要多用户与权限体系，还是先做单机单用户。
