import { afterEach, describe, expect, it, vi } from "vitest";

import { buildAuthorizeUrl, checkState, exchangeCode, getUserInfo, type FeishuConfig } from "@/lib/auth/feishu";

const config: FeishuConfig = {
  appId: "cli_test",
  appSecret: "secret",
  redirectUri: "http://127.0.0.1:3000/api/auth/feishu/callback",
};

function mockFetch(body: unknown, init?: { ok?: boolean; status?: number }) {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      json: () => Promise.resolve(body),
      ok: init?.ok ?? true,
      status: init?.status ?? 200,
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("buildAuthorizeUrl", () => {
  it("拼出飞书授权页参数", () => {
    const url = new URL(buildAuthorizeUrl(config, "state-1"));
    expect(url.origin + url.pathname).toBe("https://open.feishu.cn/open-apis/authen/v1/authorize");
    expect(url.searchParams.get("app_id")).toBe("cli_test");
    expect(url.searchParams.get("redirect_uri")).toBe(config.redirectUri);
    expect(url.searchParams.get("state")).toBe("state-1");
  });
});

describe("checkState", () => {
  it("一致时通过", () => {
    expect(checkState("s", "s")).toBe(true);
  });

  it("不一致或缺失时拒绝", () => {
    expect(checkState("s", "other")).toBe(false);
    expect(checkState(undefined, "s")).toBe(false);
    expect(checkState("s", undefined)).toBe(false);
    expect(checkState("", "")).toBe(false);
  });
});

describe("exchangeCode", () => {
  it("code=0 时返回 user_access_token，且请求体用 client_id/client_secret", async () => {
    mockFetch({ code: 0, user_access_token: "u-token" });
    const result = await exchangeCode(config, "auth-code");
    expect(result).toEqual({ ok: true, value: { userAccessToken: "u-token" } });

    const fetchMock = vi.mocked(fetch);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://open.feishu.cn/open-apis/authen/v2/oauth/token");
    expect(JSON.parse(String(init?.body))).toMatchObject({
      client_id: "cli_test",
      client_secret: "secret",
      code: "auth-code",
      grant_type: "authorization_code",
    });
  });

  it("飞书返回业务错误码时走 err 分支", async () => {
    mockFetch({ code: 20003, msg: "invalid code" });
    const result = await exchangeCode(config, "bad");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("FEISHU_TOKEN_EXCHANGE_FAILED");
    expect(result.error.message).toContain("invalid code");
  });

  it("code 为字符串 \"0\" 也算成功（飞书 v2 的坑）", async () => {
    mockFetch({ code: "0", user_access_token: "u-token" });
    const result = await exchangeCode(config, "auth-code");
    expect(result).toEqual({ ok: true, value: { userAccessToken: "u-token" } });
  });

  it("无 code 字段但带 access_token 的纯 OAuth2 响应也算成功", async () => {
    mockFetch({ access_token: "oauth-token", token_type: "Bearer" });
    const result = await exchangeCode(config, "auth-code");
    expect(result).toEqual({ ok: true, value: { userAccessToken: "oauth-token" } });
  });

  it("v2 风格错误（error/error_description 字段）透出真实原因", async () => {
    mockFetch({ code: 20003, error: "invalid_grant", error_description: "code expired" });
    const result = await exchangeCode(config, "bad");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.message).toContain("code expired");
  });

  it("fetch 抛异常时收敛为 err，不外抛", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const result = await exchangeCode(config, "auth-code");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("FEISHU_TOKEN_EXCHANGE_FAILED");
  });
});

describe("getUserInfo", () => {
  it("code=0 时返回用户资料，并带 Bearer 头", async () => {
    mockFetch({ code: 0, data: { avatar_url: "https://a.b/c.png", name: "张三", open_id: "ou_1" } });
    const result = await getUserInfo("u-token");
    expect(result).toEqual({
      ok: true,
      value: { avatarUrl: "https://a.b/c.png", name: "张三", openId: "ou_1" },
    });

    const fetchMock = vi.mocked(fetch);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://open.feishu.cn/open-apis/authen/v1/user_info");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer u-token");
  });

  it("飞书返回业务错误码时走 err 分支", async () => {
    mockFetch({ code: 99991663, msg: "token expired" });
    const result = await getUserInfo("expired");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("FEISHU_USER_INFO_FAILED");
  });
});
