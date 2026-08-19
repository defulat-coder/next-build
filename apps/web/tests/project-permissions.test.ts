import { describe, expect, it } from "vitest";

import { hasProjectPermissionIn, type MyPermissionsDto } from "@/components/permissions-provider";

const snapshot: MyPermissionsDto = {
  permissions: ["project:read", "repo:manage"],
  projects: [
    { permissions: ["project:read", "repo:manage"], projectId: "p-1" },
    { permissions: ["project:read"], projectId: "p-2" },
  ],
  siteRole: "site:member",
};

describe("hasProjectPermissionIn", () => {
  it("项目权限不跨项目误显示", () => {
    expect(hasProjectPermissionIn(snapshot, "p-1", "repo:manage")).toBe(true);
    expect(hasProjectPermissionIn(snapshot, "p-2", "repo:manage")).toBe(false);
  });

  it("site admin 对任意项目短路放行，未加载时拒绝", () => {
    expect(hasProjectPermissionIn({ ...snapshot, siteRole: "site:admin" }, "unknown", "project:delete")).toBe(true);
    expect(hasProjectPermissionIn(null, "p-1", "repo:manage")).toBe(false);
  });
});
