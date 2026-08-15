import { Hono } from "hono";
import { handle } from "hono/vercel";

const app = new Hono().basePath("/api");

app.get("/health", (c) => c.json({ ok: true }));

export const GET = handle(app);
export const POST = handle(app);
export const PUT = handle(app);
export const PATCH = handle(app);
export const DELETE = handle(app);
