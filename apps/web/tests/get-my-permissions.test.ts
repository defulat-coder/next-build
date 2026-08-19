import { describe, expect, it, vi } from "vitest";

import { ok } from "@next-build/result";

import { createGetMyPermissions } from "@/server/application/iam/get-my-permissions";
import type { IamStore } from "@/server/domains/iam/ports";

describe("getMyPermissions", () => {
  it("保留每个项目各自的动态权限码", async () => {
    const iamStore = {
      getPermissionsForUser: vi.fn(async () =>
        ok({
          projects: [
            { permissions: ["project:read", "repo:manage"], projectId: "p-1", role: "project:owner" },
            { permissions: ["project:read"], projectId: "p-2", role: "project:viewer" },
          ],
          sitePermissions: ["project:create"],
          siteRole: "site:member",
          userId: "u-1",
        }),
      ),
    } as unknown as IamStore;

    const result = await createGetMyPermissions({ iamStore })("u-1");

    expect(result.ok && result.value.projects).toEqual([
      {
        permissions: ["project:read", "repo:manage"],
        projectId: "p-1",
        role: "project:owner",
      },
      { permissions: ["project:read"], projectId: "p-2", role: "project:viewer" },
    ]);
  });
});
