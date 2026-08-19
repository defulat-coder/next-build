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

describe("delivery chain migration 0005", () => {
  it("为既有项目与仓库回填版本默认值，并创建任务交付表", () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    for (const file of [
      "0000_milky_klaw.sql",
      "0001_lonely_shiver_man.sql",
      "0002_broken_tombstone.sql",
      "0003_promote-members-to-admin.sql",
      "0004_stiff_war_machine.sql",
    ]) {
      sqlite.exec(readFileSync(join(migrationsFolder, file), "utf8"));
    }
    sqlite.prepare("INSERT INTO users (id, feishu_open_id, name, created_at, last_login_at) VALUES (?, ?, ?, ?, ?)")
      .run("u1", "ou_1", "张三", 1, 1);
    sqlite.prepare("INSERT INTO projects (id, name, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run("p1", "既有项目", "u1", 1, 1);
    sqlite.prepare(
      "INSERT INTO project_repos (id, project_id, repo, default_branch, is_primary, access_status, last_validated_at, added_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    ).run("r1", "p1", "octo/one", "main", 1, "available", 1, 1);

    sqlite.exec(readFileSync(join(migrationsFolder, "0005_loud_radioactive_man.sql"), "utf8"));

    expect(sqlite.prepare("SELECT version, lifecycle_status, success_criteria FROM projects WHERE id = 'p1'").get())
      .toEqual({ lifecycle_status: "planned", success_criteria: "[]", version: 1 });
    expect(sqlite.prepare("SELECT version, detached_at FROM project_repos WHERE id = 'r1'").get())
      .toEqual({ detached_at: null, version: 1 });
    const tables = sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[];
    expect(tables.map((row) => row.name)).toEqual(expect.arrayContaining(["tasks", "task_runs", "deliveries", "knowledge_generations"]));
  });
});

describe("business acceptance migration 0006", () => {
  it("为既有任务回填 pending 验收，并把 merged Task 迁为 acceptance_pending", () => {
    const sqlite = new Database(":memory:");
    sqlite.pragma("foreign_keys = ON");
    for (const file of [
      "0000_milky_klaw.sql", "0001_lonely_shiver_man.sql", "0002_broken_tombstone.sql",
      "0003_promote-members-to-admin.sql", "0004_stiff_war_machine.sql", "0005_loud_radioactive_man.sql",
    ]) sqlite.exec(readFileSync(join(migrationsFolder, file), "utf8"));
    sqlite.prepare("INSERT INTO users (id, feishu_open_id, name, created_at, last_login_at) VALUES ('u1','ou_1','张三',1,1)").run();
    sqlite.prepare("INSERT INTO projects (id,name,created_by,created_at,updated_at) VALUES ('p1','项目','u1',1,1)").run();
    sqlite.prepare("INSERT INTO project_repos (id,project_id,repo,default_branch,is_primary,access_status,last_validated_at,added_at) VALUES ('r1','p1','octo/demo','main',1,'available',1,1)").run();
    sqlite.prepare("INSERT INTO tasks (id,project_id,project_repo_id,title,requirement,acceptance_criteria,validation_commands,created_by,status,idempotency_key,command_fingerprint,canonical_repo,default_branch,base_sha,validation_version,branch,created_at,updated_at) VALUES ('t1','p1','r1','任务','需求','[\"通过\"]','[\"pnpm test\"]','u1','merged','key','fp','octo/demo','main','abc',1,'agent/t1',1,1)").run();

    sqlite.exec(readFileSync(join(migrationsFolder, "0006_smiling_sabretooth.sql"), "utf8"));

    expect(sqlite.prepare("SELECT status FROM tasks WHERE id='t1'").get()).toEqual({ status: "acceptance_pending" });
    expect(sqlite.prepare("SELECT task_id, status, criteria_results FROM task_acceptances WHERE task_id='t1'").get())
      .toEqual({ criteria_results: "[]", status: "pending", task_id: "t1" });
  });
});
