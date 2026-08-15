# Agent Instructions

## Monorepo Layout

pnpm workspace：

- `apps/web` — Next.js 16 全栈应用（前端 + Hono API，主战场）
- `packages/db` — 数据层窄接口（`DocStore`），实现为 better-sqlite3 + FTS5
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

## Commit Attribution

AI commits MUST include:

```text
Co-Authored-By: <agent model> <noreply@example.com>
```
