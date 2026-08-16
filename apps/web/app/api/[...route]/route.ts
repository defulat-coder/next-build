import { randomUUID } from "node:crypto";

import { Hono } from "hono";
import { handle } from "hono/vercel";

import { logger } from "@/lib/logger";
import { authGuard } from "@/server/interface/http/auth-guard";
import { authRoutes } from "@/server/interface/http/auth.routes";

const app = new Hono<{ Variables: { requestId: string } }>().basePath("/api");

// 请求完成事件：每个请求一条（request_id + 路由模板 + 状态码 + 耗时）。
// 用 routePath 而非原始 path——路径里的 id 会把日志标签打成无限基数（AGENTS.md「日志」）。
app.use("*", async (c, next) => {
  const start = performance.now();
  const requestId = randomUUID();
  c.set("requestId", requestId);
  await next();
  logger.info(
    {
      duration_ms: Math.round(performance.now() - start),
      event: "api.request",
      method: c.req.method,
      request_id: requestId,
      route: c.req.routePath,
      status: c.res.status,
    },
    `${c.req.method} ${c.req.routePath} ${c.res.status}`,
  );
});

// 未捕获异常兜底为 500 INTERNAL_ERROR（AGENTS.md「异常处理」）。
// err 字段走 pino 的 Error 序列化器，保留原始异常的完整堆栈。
app.onError((error, c) => {
  logger.error(
    { err: error, "error.code": "INTERNAL_ERROR", event: "api.error", request_id: c.get("requestId") },
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
