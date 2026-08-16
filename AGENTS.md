# Agent Instructions

## Monorepo Layout

pnpm workspace：

- `apps/web` — Next.js 16 全栈应用（前端 + Hono API，主战场）
- `packages/db` — 数据层窄接口（`DocStore`），实现为 better-sqlite3 + FTS5
- `packages/result` — 零依赖 `Result<T, E>` 工具（`ok` / `err` / `map` / `flatMap` / `tryCatch`），异常处理约定的基础设施
- `packages/sandbox` — 沙箱层窄接口（`SandboxProvider`），实现为 microsandbox

根目录脚本均为委托：`pnpm dev` / `build` / `lint` 转发到 `apps/web`，`pnpm typecheck` / `test` 跑全部包（`pnpm -r`）。

## Package Manager

Use **pnpm**（Node.js `>=22.19.0`）：`pnpm install`, `pnpm dev`

## Checks

- 改动 app 代码或配置后跑 `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`。
- `apps/web` 的 typecheck 走 TypeScript 7（`apps/web/scripts/tsc7.mjs`）；保留 `typescript@6` 供 Next.js 与 ESLint 兼容层使用。`packages/*` 用 typescript@6 的 `tsc --noEmit`。

## File-Scoped Commands

在 `apps/web` 目录下执行（或加 `pnpm -C apps/web` 前缀）：

| Task | Command |
| --- | --- |
| Lint one file | `pnpm exec eslint path/to/file.tsx` |
| Run one Vitest file | `pnpm exec vitest run path/to/file.test.ts` |
| Typecheck | `pnpm typecheck`（根目录可直接跑） |

## Conventions

- `PRODUCT.md` 是产品规划的 Source of Truth；功能实现前先对照它。
- 提交信息使用中文 Conventional Commits。
- 保持提交在本地，除非明确要求 push。

## 后端架构（DDD）

完整设计见 `docs/architecture-backend-ddd.md`（子域分析、模式选择理由、新上下文落地步骤）。核心规则：

- **四层职责**：`apps/web/server/` 下 `interface`（HTTP 翻译，无业务逻辑）、`application`（用例编排，事务脚本）、`domains`（限界上下文：model/errors/ports）、`infrastructure`（外部世界适配器）；依赖方向只许 `interface → application → domains ← infrastructure`。
- **新功能必须先归入一个限界上下文**（`domains/<ctx>/`）；拿不准归属就在 PR/提交说明里写理由。
- **packages 是适配器**：`packages/db`（持久化）、`packages/sandbox`（执行环境）、`packages/result`（共享内核）；端口契约留在 packages 窄接口里，业务规则不进 packages。
- **业务逻辑模式默认事务脚本**（用例函数编排端口）；升级领域模型需逐上下文论证并更新 `docs/architecture-backend-ddd.md`。
- **与异常/日志约定咬合**：错误判别联合带 `kind: "business" | "system"` 归 `domains/<ctx>/errors.ts`；日志在产生层打点。

## 异常处理

完整设计见 `docs/architecture-error-handling.md`（分层模型、错误码注册表、六道兜底防线）。遵循 skill `web-error-handling-result-types`（`.agents/skills/`），核心规则：

**异常分两类**：

- **业务异常（人类可读）**：预期内、用户能理解并能行动的失败——未登录、校验失败、飞书授权失败、外部 API 拒绝等。`message` 面向用户书写，API 原样透传 + 4xx 状态码；日志记 `warn`。
- **系统异常（内部）**：非预期或基础设施故障——DB 故障、网络中断、编程 bug。API **不透传内部细节**，前端只显示通用文案 + `error.code`；日志记 `error`，细节全在日志里。

**核心规则**：

- **预期/可恢复错误返回 `Result<T, E>`，不 throw**：校验失败、外部 API（GitHub/飞书）、沙箱执行、DB 读写、Agent 运行失败。Result 工具由零依赖小包 `@next-build/result` 提供（`ok` / `err` / `map` / `flatMap` / `tryCatch`）。
- **非预期错误直接 throw**：编程 bug、启动期配置缺失（`lib/env.ts` 校验失败即属此类）。
- **错误对象是判别联合**：带 `code` 常量 + `message` + 可选 `cause`（`cause` 携带原始异常对象），禁止裸 `Error` / `string`；每个包定义自己的错误码枚举（`DbError`、`SandboxError`、`AuthError` 等）。
- **日志与异常一起写，不吞原始异常**：任何 catch / 返回错误的点位必须同步打点；**原始 Error 对象以 `err` 字段进日志**（pino 序列化器自动带完整堆栈），不允许只记 message 字符串，不允许"记了日志就当处理过"。
- **API 边界统一翻译**：Hono handler 把 Result 映射为 `{ error: { code, message } }` + 对应状态码——业务异常 message 透传，系统异常替换为通用文案；未捕获异常由 `app.onError` 兜底为 500 `INTERNAL_ERROR` + `err` 全堆栈日志。
- **沙箱内任务**：失败写入任务状态（`stage: "failed"` + error），不允许静默吞错。
- **前端**：fetch 封装解析 `error.code` 做针对性提示；渲染级错误走 Next `error.tsx`；任何 Result 返回值不允许丢弃。

## 日志

遵循 skill `structured-logging-lite`（`.agents/skills/`），AI 时代日志是问题追踪的主通道，核心规则：

- **日志器**：`pino`（结构化 JSON）；只在 `apps/web` 的组合根配置输出。`packages/*` 是库，**只接受宿主注入的 `Logger` 接口**，不自带全局输出。
- **事件即契约**：稳定的事件名（`task.created`、`sandbox.exec`、`wiki.generated`、`ask.query` 等）+ 固定字段（`task_id`、`workspace_id`、`duration_ms`、`error.code`），每条日志必须能回答一个具体的排查问题；不记流水账。
- **关联**：一次 API 请求一个 `request_id`，一个任务全程带 `task_id`，可串起 路由 → 沙箱 → Agent 的完整链路。
- **与异常方案咬合**：错误聚合用固定 `error.code`（Result 方案的错误码），不用裸错误字符串；`cause` 保留安全摘要用于调试。
- **脱敏**：永不记录 token、key、cookie、请求体；prompt 等用户内容本地可记，上服务器前再评。
- **级别**：`info` = 生命周期里程碑，`warn` = 降级但继续，`error` = 失败；失败不允许降级成 warn 后静默。
- **强制执行**：任何新功能/新路由/新包的开发，交付时必须同步补齐日志（生命周期事件 + 失败事件 + 关联字段），日志缺失视为功能未完成；`api.request` 请求级中间件已覆盖所有路由，功能事件需各自打点。

## Commit Attribution

AI commits MUST include:

```text
Co-Authored-By: <agent model> <noreply@example.com>
```
