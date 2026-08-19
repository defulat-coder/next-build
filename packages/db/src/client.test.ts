import { existsSync, mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

import { describe, expect, it } from "vitest";

import { createDb } from "./client";

const migrationsFolder = fileURLToPath(new URL("../drizzle", import.meta.url));

describe("createDb migration lock", () => {
  it("另一个进程持有迁移锁时等待释放，避免并发重放 DDL", async () => {
    const directory = mkdtempSync(join(tmpdir(), "next-build-migration-"));
    const dbPath = join(directory, "app.db");
    const lockPath = `${dbPath}.migration.lock`;
    mkdirSync(lockPath);
    const releaser = spawn(process.execPath, ["-e", `setTimeout(() => require('node:fs').rmSync(${JSON.stringify(lockPath)}, { recursive: true }), 120)`]);
    const started = Date.now();
    createDb({ dbPath, migrationsFolder });
    expect(Date.now() - started).toBeGreaterThanOrEqual(75);
    expect(existsSync(lockPath)).toBe(false);
    await new Promise<void>((resolve, reject) => { releaser.once("exit", () => resolve()); releaser.once("error", reject); });
    rmSync(directory, { force: true, recursive: true });
  });
});
