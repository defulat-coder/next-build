import { afterEach, describe, expect, it, vi } from "vitest";

import { checkRepo, parseRepoInput } from "@/server/infrastructure/gateways/github-client";

const config = { token: "ghp_test" };

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

describe("parseRepoInput", () => {
  it("接受 owner/repo", () => {
    expect(parseRepoInput("octocat/hello-world")).toBe("octocat/hello-world");
  });

  it("解析 GitHub URL（可带 .git / 末尾斜杠）", () => {
    expect(parseRepoInput("https://github.com/octocat/hello-world")).toBe("octocat/hello-world");
    expect(parseRepoInput("https://github.com/octocat/hello-world.git")).toBe("octocat/hello-world");
    expect(parseRepoInput("https://github.com/octocat/hello-world/")).toBe("octocat/hello-world");
  });

  it("非法输入返回 null", () => {
    expect(parseRepoInput("hello-world")).toBeNull();
    expect(parseRepoInput("")).toBeNull();
    expect(parseRepoInput("https://gitlab.com/octocat/hello")).toBeNull();
  });
});

describe("checkRepo", () => {
  it("存在且可访问时返回规范化全名与默认分支，并带 Bearer 头", async () => {
    mockFetch({ default_branch: "main", full_name: "octocat/hello-world", id: 1, permissions: { push: true } });
    const result = await checkRepo(config, "octocat/hello-world");
    expect(result).toEqual({
      ok: true,
      value: {
        canCreatePr: true,
        canPush: true,
        defaultBranch: "main",
        providerRepoId: "1",
        repo: "octocat/hello-world",
      },
    });

    const fetchMock = vi.mocked(fetch);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/octocat/hello-world");
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer ghp_test");
  });

  it("404 时是业务异常（仓库不存在或无权限）", async () => {
    mockFetch({ message: "Not Found" }, { ok: false, status: 404 });
    const result = await checkRepo(config, "octocat/no-such");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("GITHUB_REPO_NOT_FOUND");
    expect(result.error.kind).toBe("business");
  });

  it("网络错误时是系统异常，不外抛", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const result = await checkRepo(config, "octocat/hello-world");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("GITHUB_API_FAILED");
    expect(result.error.kind).toBe("system");
    expect(result.error.cause).toBeInstanceOf(Error);
  });

  it("429 限流是系统异常", async () => {
    mockFetch({ message: "rate limited" }, { ok: false, status: 429 });
    const result = await checkRepo(config, "octocat/hello-world");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toMatchObject({ code: "GITHUB_API_FAILED", kind: "system" });
  });
});
