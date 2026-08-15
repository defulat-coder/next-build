# Next Build

软件自动化研发平台（规划中）。以任务为核心视角，基于 Claude Agent SDK 驱动 Agent 完成代码研发。

- 产品规划与功能边界：见 [`PRODUCT.md`](./PRODUCT.md)
- 技术栈：Next.js 16 + React 19 + TypeScript + Hono + Tailwind CSS v4，前后端全 TS

## 开发

```bash
pnpm install
pnpm dev        # http://127.0.0.1:3000
```

## 检查

```bash
pnpm typecheck  # TypeScript 7
pnpm lint
pnpm test
pnpm build
```
