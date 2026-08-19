import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyWebhookSignature } from "@/server/infrastructure/gateways/verify-webhook-signature";

describe("verifyWebhookSignature", () => {
  it("只接受当前 secret 对原始 body 生成的 sha256 签名", () => {
    const body = JSON.stringify({ action: "closed" });
    const secret = "a-secure-webhook-secret";
    const signature = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(verifyWebhookSignature(body, signature, secret)).toBe(true);
    expect(verifyWebhookSignature(`${body} `, signature, secret)).toBe(false);
    expect(verifyWebhookSignature(body, undefined, secret)).toBe(false);
  });
});
