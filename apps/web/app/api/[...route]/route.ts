import { Hono } from "hono";
import { handle } from "hono/vercel";

import { authGuard } from "@/lib/auth/guard";
import { authRoutes } from "@/lib/auth/routes";
import { logger } from "@/lib/logger";

const app = new Hono().basePath("/api");

// 未捕获异常兜底为 500 INTERNAL_ERROR（AGENTS.md「异常处理」）。
app.onError((error, c) => {
  logger.error(
    { cause: error.message, "error.code": "INTERNAL_ERROR", event: "api.error" },
    "API 未捕获异常",
  );
  return c.json({ error: { code: "INTERNAL_ERROR", message: "服务器内部错误" } }, 500);
});

// 整站保护：先过会话守卫，再进具体路由。
app.use("*", authGuard);

app.get("/health", (c) => c.json({ ok: true }));
app.route("/auth", authRoutes);

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
