import { Hono } from "hono";

import { getGitHubWebhookEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getOutboxDispatcher, taskStore } from "@/server/composition-root";
import { verifyWebhookSignature } from "@/server/infrastructure/gateways/verify-webhook-signature";

import type { AuthVariables } from "./auth-guard";

type PullRequestPayload = {
  repository?: { full_name?: string };
  pull_request?: {
    number?: number;
    node_id?: string;
    html_url?: string;
    state?: "open" | "closed";
    draft?: boolean;
    merged?: boolean;
    merged_at?: string | null;
    merge_commit_sha?: string | null;
    head?: { ref?: string; sha?: string };
  };
};

export const githubWebhookRoutes = new Hono<{ Variables: AuthVariables }>().post("/github", async (c) => {
  const body = await c.req.text();
  if (!verifyWebhookSignature(body, c.req.header("x-hub-signature-256"), getGitHubWebhookEnv().GITHUB_WEBHOOK_SECRET)) {
    logger.warn({ event: "github.webhook_rejected", request_id: c.get("requestId") }, "GitHub webhook 签名无效");
    return c.json({ error: { code: "WEBHOOK_SIGNATURE_INVALID", message: "签名无效" } }, 401);
  }
  const eventId = c.req.header("x-github-delivery");
  const eventName = c.req.header("x-github-event");
  if (!eventId || !eventName) return c.json({ error: { code: "WEBHOOK_HEADERS_INVALID", message: "缺少事件标识" } }, 400);
  if (eventName !== "pull_request") return c.json({ ok: true, ignored: true });
  let payload: PullRequestPayload;
  try { payload = JSON.parse(body) as PullRequestPayload; }
  catch { return c.json({ error: { code: "WEBHOOK_PAYLOAD_INVALID", message: "事件不是有效 JSON" } }, 400); }
  const repo = payload.repository?.full_name;
  const pull = payload.pull_request;
  if (!repo || !pull?.number || !pull.node_id || !pull.html_url || !pull.state || !pull.head?.ref || !pull.head.sha) {
    return c.json({ error: { code: "WEBHOOK_PAYLOAD_INVALID", message: "Pull Request 事件字段不完整" } }, 400);
  }
  const applied = await taskStore.applyPullRequestFact({
    draft: pull.draft === true,
    eventId,
    eventName,
    headBranch: pull.head.ref,
    headSha: pull.head.sha,
    merged: pull.merged === true,
    mergedAt: pull.merged_at ? new Date(pull.merged_at) : null,
    mergedSha: pull.merge_commit_sha ?? null,
    nodeId: pull.node_id,
    number: pull.number,
    repo,
    state: pull.state,
    url: pull.html_url,
  });
  if (!applied.ok) return c.json({ error: { code: applied.error.code, message: "服务器内部错误" } }, 500);
  getOutboxDispatcher().start();
  logger.info(
    { duplicate: applied.value.duplicate, event: "github.webhook_applied", github_event: eventName, task_id: applied.value.detail?.task.id ?? null },
    "GitHub webhook 已应用",
  );
  return c.json({ duplicate: applied.value.duplicate, matched: applied.value.detail !== null, ok: true });
});
