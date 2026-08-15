# Agent Instructions

## Package Manager

Use **pnpm**（Node.js `>=22.19.0`）：`pnpm install`, `pnpm dev`

## Checks

- 改动 app 代码或配置后跑 `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm build`。
- `pnpm typecheck` 走 TypeScript 7（`scripts/tsc7.mjs`）；保留 `typescript@6` 供 Next.js 与 ESLint 兼容层使用。

## File-Scoped Commands

| Task | Command |
| --- | --- |
| Lint one file | `pnpm exec eslint path/to/file.tsx` |
| Run one Vitest file | `pnpm exec vitest run path/to/file.test.ts` |
| Typecheck | `pnpm typecheck` |

## Conventions

- `PRODUCT.md` 是产品规划的 Source of Truth；功能实现前先对照它。
- 提交信息使用中文 Conventional Commits。
- 保持提交在本地，除非明确要求 push。

## Commit Attribution

AI commits MUST include:

```text
Co-Authored-By: <agent model> <noreply@example.com>
```
