import { describe, expect, it, vi } from "vitest";

import { err, ok } from "@next-build/result";

import { createLoginWithFeishu } from "@/server/application/auth/login-with-feishu";
import type { AuthError } from "@/server/domains/auth/errors";
import type { AuthStore, FeishuGateway } from "@/server/domains/auth/ports";

const user = { avatarUrl: null, feishuOpenId: "ou_1", id: "u-1", name: "张三" };
const input = { code: "auth-code", redirectUri: "http://127.0.0.1:3000/api/auth/feishu/callback" };

function makeDeps() {
  const calls: string[] = [];
  const gateway: FeishuGateway = {
    exchangeCode: vi.fn(async () => {
      calls.push("exchangeCode");
      return ok({ userAccessToken: "u-token" });
    }),
    getUserInfo: vi.fn(async () => {
      calls.push("getUserInfo");
      return ok({ name: "张三", openId: "ou_1" });
    }),
  };
  const authStore: AuthStore = {
    createSession: vi.fn(async () => {
      calls.push("createSession");
      return ok("session-token");
    }),
    deleteSession: vi.fn(async () => ok(undefined)),
    findUserBySession: vi.fn(async () => ok(null)),
    upsertUser: vi.fn(async () => {
      calls.push("upsertUser");
      return ok(user);
    }),
  };
  const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };
  return { authStore, calls, gateway, logger };
}

describe("loginWithFeishu", () => {
  it("成功路径按 换token→取资料→upsert→建会话 顺序编排", async () => {
    const deps = makeDeps();
    const loginWithFeishu = createLoginWithFeishu({ ...deps, sessionTtlMs: 1000 });

    const result = await loginWithFeishu(input);

    expect(result).toEqual({ ok: true, value: { sessionToken: "session-token", user } });
    expect(deps.calls).toEqual(["exchangeCode", "getUserInfo", "upsertUser", "createSession"]);
    expect(deps.gateway.exchangeCode).toHaveBeenCalledWith(input);
    expect(deps.authStore.upsertUser).toHaveBeenCalledWith({
      avatarUrl: undefined,
      feishuOpenId: "ou_1",
      name: "张三",
    });
    expect(deps.authStore.createSession).toHaveBeenCalledWith("u-1", 1000);
    expect(deps.logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ event: "auth.login", user_id: "u-1" }),
      "用户登录",
    );
  });

  it("网关失败时短路：不取资料、不落库，warn 记 auth.failed", async () => {
    const error: AuthError = {
      code: "FEISHU_TOKEN_EXCHANGE_FAILED",
      kind: "business",
      message: "飞书换 token 失败：invalid code",
    };
    const deps = makeDeps();
    vi.mocked(deps.gateway.exchangeCode).mockResolvedValue(err(error));
    const loginWithFeishu = createLoginWithFeishu({ ...deps, sessionTtlMs: 1000 });

    const result = await loginWithFeishu(input);

    expect(result).toEqual({ error, ok: false });
    expect(deps.gateway.getUserInfo).not.toHaveBeenCalled();
    expect(deps.authStore.upsertUser).not.toHaveBeenCalled();
    expect(deps.authStore.createSession).not.toHaveBeenCalled();
    expect(deps.logger.warn).toHaveBeenCalledWith(
      expect.objectContaining({ "error.code": "FEISHU_TOKEN_EXCHANGE_FAILED", event: "auth.failed" }),
      "飞书登录失败",
    );
    expect(deps.logger.info).not.toHaveBeenCalled();
  });
});
