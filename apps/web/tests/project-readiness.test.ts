import { describe, expect, it } from "vitest";

import { deriveReadiness } from "@/server/domains/project/model";

const primaryRepo = {
  accessStatus: "available" as const,
  addedAt: new Date("2026-01-01"),
  defaultBranch: "main",
  id: "r-1",
  isPrimary: true,
  lastValidatedAt: new Date("2026-01-01"),
  projectId: "p-1",
  repo: "octo/one",
};

describe("deriveReadiness", () => {
  it("无仓库为待配置", () => {
    expect(deriveReadiness({ primaryRepo: null, repoCount: 0 })).toBe("setup_required");
  });

  it("主仓可访问为已就绪", () => {
    expect(deriveReadiness({ primaryRepo, repoCount: 1 })).toBe("ready");
  });

  it("主仓不可访问或缺失为需处理", () => {
    expect(
      deriveReadiness({ primaryRepo: { ...primaryRepo, accessStatus: "unavailable" }, repoCount: 1 }),
    ).toBe("needs_attention");
    expect(deriveReadiness({ primaryRepo: null, repoCount: 1 })).toBe("needs_attention");
  });
});
