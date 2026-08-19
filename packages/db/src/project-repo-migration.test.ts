import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

describe("project repo migration 0004", () => {
  it("回填每项目最早主仓、可访问状态与最后校验时间", () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    for (const file of [
      "0000_milky_klaw.sql",
      "0001_lonely_shiver_man.sql",
      "0002_broken_tombstone.sql",
      "0003_promote-members-to-admin.sql",
    ]) {
      sqlite.exec(readFileSync(join(migrationsFolder, file), "utf8"));
    }
    sqlite.prepare(
      "INSERT INTO users (id, feishu_open_id, name, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)",
    ).run("u1", "ou_1", "张三", 1, 1);
    const insertProject = sqlite.prepare(
      "INSERT INTO projects (id, name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)",
    );
    insertProject.run("p1", "一", "u1", 1, 1);
    insertProject.run("p2", "二", "u1", 2, 2);
    insertProject.run("p3", "空项目", "u1", 3, 3);
    const insertRepo = sqlite.prepare(
      "INSERT INTO project_repos (id, project_id, repo, default_branch, added_at) VALUES (?, ?, ?, ?, ?)",
    );
    insertRepo.run("r2", "p1", "octo/two", "main", 100);
    insertRepo.run("r1", "p1", "octo/one", "main", 100);
    insertRepo.run("r3", "p2", "octo/three", "trunk", 50);

    sqlite.exec(readFileSync(join(migrationsFolder, "0004_stiff_war_machine.sql"), "utf8"));

    const rows = sqlite
      .prepare(
        "SELECT id, is_primary, access_status, last_validated_at, added_at FROM project_repos ORDER BY id",
      )
      .all() as {
      id: string;
      is_primary: number;
      access_status: string;
      last_validated_at: number;
      added_at: number;
    }[];
    expect(rows).toEqual([
      { access_status: "available", added_at: 100, id: "r1", is_primary: 1, last_validated_at: 100 },
      { access_status: "available", added_at: 100, id: "r2", is_primary: 0, last_validated_at: 100 },
      { access_status: "available", added_at: 50, id: "r3", is_primary: 1, last_validated_at: 50 },
    ]);
    expect(() => sqlite.prepare("UPDATE project_repos SET is_primary = 1 WHERE id = 'r2'").run()).toThrow();
  });
});
