import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { describe, expect, it } from "vitest";

import { createAuthStore } from "./auth-store";
import { createDb, type Db } from "./client";
import { seedIam } from "./iam-seed";
import { createIamStore, type IamStore } from "./iam-store";
import { createProjectStore } from "./project-store";
import * as schema from "./schema";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

/** 迁移 + 种子后的内存库。 */
function createTestDb(): Db {
  const db = createDb({ dbPath: ":memory:", migrationsFolder });
  seedIam(db);
  return db;
}

function createTestStore(): { db: Db; store: IamStore } {
  const db = createTestDb();
  return { db, store: createIamStore(db) };
}

async function addUser(db: Db, feishuOpenId: string, name: string): Promise<string> {
  const user = await createAuthStore(db).upsertUser({ feishuOpenId, name });
  if (!user.ok) throw new Error("upsertUser failed");
  return user.value.id;
}

async function addProject(db: Db, createdBy: string, name: string): Promise<string> {
  const project = await createProjectStore(db).createProject({ createdBy, name });
  if (!project.ok) throw new Error("createProject failed");
  return project.value.id;
}

describe("seedIam", () => {
  it("幂等：重复执行不报错，角色/权限/映射与常量表一致", () => {
    const db = createTestDb();
    seedIam(db);
    seedIam(db);

    const roleRows = db.select().from(schema.roles).all();
    expect(roleRows).toHaveLength(6);
    expect(roleRows.every((r) => r.builtIn)).toBe(true);
    expect(db.select().from(schema.permissions).all()).toHaveLength(13);

    const adminRole = roleRows.find((r) => r.code === "site:admin");
    const mappings = db.select().from(schema.rolePermissions).all();
    expect(mappings.filter((m) => m.roleId === adminRole?.id)).toHaveLength(13);
  });

  it("种子不清空库内已有映射：缺失的默认映射补齐，管理页配置的额外映射保留", () => {
    const db = createTestDb();
    const memberRole = db.select().from(schema.roles).where(eq(schema.roles.code, "site:member")).all()[0];

    // 模拟管理页改动：删掉一个默认映射（project:create），加一个默认之外的映射（task:read）。
    db.delete(schema.rolePermissions)
      .where(
        and(
          eq(schema.rolePermissions.roleId, memberRole.id),
          eq(schema.rolePermissions.permissionCode, "project:create"),
        ),
      )
      .run();
    db.insert(schema.rolePermissions)
      .values({ permissionCode: "task:read", roleId: memberRole.id })
      .run();

    seedIam(db);

    const codes = db
      .select({ code: schema.rolePermissions.permissionCode })
      .from(schema.rolePermissions)
      .where(eq(schema.rolePermissions.roleId, memberRole.id))
      .all()
      .map((r) => r.code);
    // 缺失的默认映射被补回，额外映射不被清空。
    expect(codes).toContain("project:create");
    expect(codes).toContain("task:read");
  });

  it("迁移既有数据：无整站角色的 users 补 site:admin；projects.created_by 回填 owner", async () => {
    // 只迁移不种子，手动写入「既有」用户与项目后再跑种子。
    const db = createDb({ dbPath: ":memory:", migrationsFolder });
    const u1 = await addUser(db, "ou_old1", "最早用户");
    const u2 = await addUser(db, "ou_old2", "次早用户");
    const projectId = await addProject(db, u2, "既有项目");

    seedIam(db);
    const store = createIamStore(db);

    // 默认登录即全权限（docs/architecture-rbac-menu.md §2）：无角色用户一律 site:admin。
    expect(await store.getSiteRole(u1)).toEqual({ ok: true, value: "site:admin" });
    expect(await store.getSiteRole(u2)).toEqual({ ok: true, value: "site:admin" });
    // 项目创建者被回填为 owner。
    expect(await store.getProjectRole(u2, projectId)).toEqual({ ok: true, value: "project:owner" });
  });

  it("一次性迁移 0003：既有 member 提升为 admin；之后的降级不被种子回放", async () => {
    // 模拟 0003 之前的既有部署：只应用 0000-0002，种子后手动置两个 member。
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    for (const file of ["0000_milky_klaw.sql", "0001_lonely_shiver_man.sql", "0002_broken_tombstone.sql"]) {
      sqlite.exec(readFileSync(join(migrationsFolder, file), "utf8"));
    }
    const db = drizzle(sqlite, { schema });
    seedIam(db);
    const store = createIamStore(db);
    const u1 = await addUser(db, "ou_1", "张三");
    const u2 = await addUser(db, "ou_2", "李四");
    await store.assignSiteRole(u1, "site:member");
    await store.assignSiteRole(u2, "site:member");

    // 应用一次性迁移：member → admin。
    sqlite.exec(readFileSync(join(migrationsFolder, "0003_promote-members-to-admin.sql"), "utf8"));
    expect(await store.getSiteRole(u1)).toEqual({ ok: true, value: "site:admin" });
    expect(await store.getSiteRole(u2)).toEqual({ ok: true, value: "site:admin" });

    // 之后管理员在管理页把 u1 降级为 member：种子重跑不得升回去。
    await store.assignSiteRole(u1, "site:member");
    seedIam(db);
    expect(await store.getSiteRole(u1)).toEqual({ ok: true, value: "site:member" });
  });
});

describe("IamStore", () => {
  it("ensureSiteRole 引导：新用户一律默认 site:admin；已有角色不重复分配", async () => {
    const { db, store } = createTestStore();
    const u1 = await addUser(db, "ou_1", "张三");
    const u2 = await addUser(db, "ou_2", "李四");

    expect(await store.ensureSiteRole(u1)).toEqual({ ok: true, value: "site:admin" });
    expect(await store.ensureSiteRole(u2)).toEqual({ ok: true, value: "site:admin" });
    // 幂等：再调一次角色不变。
    expect(await store.ensureSiteRole(u1)).toEqual({ ok: true, value: "site:admin" });
  });

  it("assignSiteRole 分配与改角色；getSiteRole 未分配返回 null", async () => {
    const { db, store } = createTestStore();
    const u1 = await addUser(db, "ou_1", "张三");

    expect(await store.getSiteRole(u1)).toEqual({ ok: true, value: null });
    expect((await store.assignSiteRole(u1, "site:member")).ok).toBe(true);
    expect(await store.getSiteRole(u1)).toEqual({ ok: true, value: "site:member" });
    expect((await store.assignSiteRole(u1, "site:admin")).ok).toBe(true);
    expect(await store.getSiteRole(u1)).toEqual({ ok: true, value: "site:admin" });
  });

  it("upsertProjectMember 增成员与改角色；removeProjectMember 移出后查不到", async () => {
    const { db, store } = createTestStore();
    const owner = await addUser(db, "ou_1", "张三");
    const member = await addUser(db, "ou_2", "李四");
    const projectId = await addProject(db, owner, "项目");

    expect(await store.getProjectRole(member, projectId)).toEqual({ ok: true, value: null });

    expect((await store.upsertProjectMember({ projectId, role: "project:member", userId: member })).ok).toBe(true);
    expect(await store.getProjectRole(member, projectId)).toEqual({ ok: true, value: "project:member" });

    // upsert 改角色。
    expect((await store.upsertProjectMember({ projectId, role: "project:viewer", userId: member })).ok).toBe(true);
    expect(await store.getProjectRole(member, projectId)).toEqual({ ok: true, value: "project:viewer" });

    const members = await store.listProjectMembers(projectId);
    expect(members.ok).toBe(true);
    if (!members.ok) return;
    expect(members.value).toHaveLength(1);
    expect(members.value[0]).toMatchObject({ projectId, role: "project:viewer", userId: member });

    expect((await store.removeProjectMember(projectId, member)).ok).toBe(true);
    expect(await store.getProjectRole(member, projectId)).toEqual({ ok: true, value: null });
  });

  it("getPermissionsForUser：整站权限 ∪ 各项目权限，均从库内映射解析", async () => {
    const { db, store } = createTestStore();
    const u1 = await addUser(db, "ou_1", "张三");
    await store.assignSiteRole(u1, "site:member");
    const projectId = await addProject(db, u1, "项目");
    await store.upsertProjectMember({ projectId, role: "project:owner", userId: u1 });

    const perms = await store.getPermissionsForUser(u1);
    expect(perms.ok).toBe(true);
    if (!perms.ok) return;
    expect(perms.value.siteRole).toBe("site:member");
    expect(perms.value.sitePermissions.sort()).toEqual(["project:create", "project:read"]);
    expect(perms.value.projects).toHaveLength(1);
    expect(perms.value.projects[0].projectId).toBe(projectId);
    expect(perms.value.projects[0].role).toBe("project:owner");
    expect(perms.value.projects[0].permissions).toContain("member:manage");
    expect(perms.value.projects[0].permissions).toContain("project:delete");

    // 无角色用户：空权限集。
    const u2 = await addUser(db, "ou_2", "李四");
    const empty = await store.getPermissionsForUser(u2);
    expect(empty).toEqual({ ok: true, value: { projects: [], sitePermissions: [], siteRole: null, userId: u2 } });
  });

  it("listUsersWithRoles：全部用户带整站角色，按注册时间升序", async () => {
    const { db, store } = createTestStore();
    const u1 = await addUser(db, "ou_1", "张三");
    const u2 = await addUser(db, "ou_2", "李四");
    await store.assignSiteRole(u1, "site:admin");

    const list = await store.listUsersWithRoles();
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.value.map((u) => u.id)).toEqual([u1, u2]);
    expect(list.value[0].siteRole).toBe("site:admin");
    expect(list.value[1].siteRole).toBeNull();
  });

  it("listRolesWithPermissions：全部内置角色带权限码集合（admin 含 role:manage 全量）", async () => {
    const { store } = createTestStore();

    const result = await store.listRolesWithPermissions();
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value).toHaveLength(6);

    const admin = result.value.find((r) => r.code === "site:admin");
    expect(admin?.permissions).toHaveLength(13);
    expect(admin?.permissions).toContain("role:manage");
    const member = result.value.find((r) => r.code === "site:member");
    expect(member?.permissions.sort()).toEqual(["project:create", "project:read"]);
  });

  it("setRolePermissions 全量替换映射并即刻生效；未知权限码返回 DB_WRITE_FAILED", async () => {
    const { db, store } = createTestStore();
    const u1 = await addUser(db, "ou_1", "张三");
    await store.assignSiteRole(u1, "site:member");

    const rolesResult = await store.listRolesWithPermissions();
    if (!rolesResult.ok) throw new Error("listRolesWithPermissions failed");
    const member = rolesResult.value.find((r) => r.code === "site:member");
    if (!member) throw new Error("site:member missing");

    // 全量替换：member 只剩 project:read。
    expect((await store.setRolePermissions(member.id, ["project:read"])).ok).toBe(true);
    const perms = await store.getPermissionsForUser(u1);
    expect(perms.ok).toBe(true);
    if (!perms.ok) return;
    expect(perms.value.sitePermissions).toEqual(["project:read"]);

    // 未知权限码：报错且不写库（DB_WRITE_FAILED + db.error 打点由 store 负责）。
    const bad = await store.setRolePermissions(member.id, ["project:read", "no:such" as never]);
    expect(bad.ok).toBe(false);
    if (bad.ok) return;
    expect(bad.error.code).toBe("DB_WRITE_FAILED");
    const after = await store.listRolesWithPermissions();
    if (!after.ok) throw new Error("listRolesWithPermissions failed");
    expect(after.value.find((r) => r.code === "site:member")?.permissions).toEqual(["project:read"]);
  });

  it("DB 失败时在产生层打 db.error（err 带原始异常），Result 照常返回", async () => {
    const calls: { fields: Record<string, unknown>; message: string }[] = [];
    const logger = {
      error: (fields: Record<string, unknown>, message: string) => calls.push({ fields, message }),
      info: () => {},
      warn: () => {},
    };
    // 人为制造故障：不跑迁移，roles 表不存在，getSiteRole 必炸。
    const db = drizzle(new Database(":memory:"), { schema });
    const store = createIamStore(db, { logger });

    const result = await store.getSiteRole("u-x");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DB_READ_FAILED");

    expect(calls).toHaveLength(1);
    expect(calls[0].fields).toMatchObject({ "error.code": "DB_READ_FAILED", event: "db.error", op: "getSiteRole" });
    expect(calls[0].fields.err).toBeInstanceOf(Error);
  });
});
