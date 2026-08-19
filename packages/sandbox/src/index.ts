import { err, ok, type Result } from "@next-build/result";
import { MiB, Sandbox as Microsandbox } from "microsandbox";

export interface SandboxError {
  code: "SANDBOX_CREATE_FAILED" | "SANDBOX_NOT_FOUND" | "SANDBOX_EXEC_FAILED" | "SANDBOX_FS_FAILED" | "SANDBOX_DESTROY_FAILED";
  message: string;
  cause?: unknown;
}
export interface SandboxCreateOptions {
  name: string;
  env?: Record<string, string>;
  secrets?: Array<{ envVar: string; value: string; allowedHost: string }>;
  source?: { url: string; depth?: number; revision?: string };
}
export interface ExecOptions { cwd?: string; env?: Record<string, string>; detached?: boolean }
export interface ExecResult { exitCode: number | null; stdout: string; stderr: string }
export interface Sandbox {
  readonly name: string;
  exec(command: string, args?: string[], opts?: ExecOptions): Promise<Result<ExecResult, SandboxError>>;
  readFile(path: string): Promise<Result<Uint8Array | null, SandboxError>>;
  writeFile(path: string, content: Uint8Array | string): Promise<Result<void, SandboxError>>;
  destroy(): Promise<Result<void, SandboxError>>;
}
export interface SandboxProvider {
  create(opts: SandboxCreateOptions): Promise<Result<Sandbox, SandboxError>>;
  get(name: string): Promise<Result<Sandbox, SandboxError>>;
}

function wrap(sandbox: Microsandbox): Sandbox {
  return {
    name: sandbox.name,
    async exec(command, args = [], opts = {}) {
      try {
        if (opts.detached) {
          await sandbox.execStreamWith(command, (builder) => {
            let next = builder.args(args);
            if (opts.cwd) next = next.cwd(opts.cwd);
            for (const [key, value] of Object.entries(opts.env ?? {})) next = next.env(key, value);
            return next;
          });
          return ok({ exitCode: null, stderr: "", stdout: "" });
        }
        const output = await sandbox.execWith(command, (builder) => {
          let next = builder.args(args);
          if (opts.cwd) next = next.cwd(opts.cwd);
          for (const [key, value] of Object.entries(opts.env ?? {})) next = next.env(key, value);
          return next;
        });
        return ok({ exitCode: output.code, stderr: output.stderr(), stdout: output.stdout() });
      } catch (cause) {
        return err({ cause, code: "SANDBOX_EXEC_FAILED", message: `沙箱命令执行失败：${command}` });
      }
    },
    async readFile(path) {
      try { return ok(await sandbox.fs().exists(path) ? await sandbox.fs().read(path) : null); }
      catch (cause) { return err({ cause, code: "SANDBOX_FS_FAILED", message: `读取沙箱文件失败：${path}` }); }
    },
    async writeFile(path, content) {
      try { await sandbox.fs().write(path, content); return ok(undefined); }
      catch (cause) { return err({ cause, code: "SANDBOX_FS_FAILED", message: `写入沙箱文件失败：${path}` }); }
    },
    async destroy() {
      try { await sandbox.stopWithTimeout(10_000); await Microsandbox.remove(sandbox.name); return ok(undefined); }
      catch (cause) { return err({ cause, code: "SANDBOX_DESTROY_FAILED", message: "销毁沙箱失败" }); }
    },
  };
}

export function createMicrosandboxProvider(options?: { image?: string }): SandboxProvider {
  return {
    async create(opts) {
      try {
        let builder = Microsandbox.builder(opts.name)
          .image(options?.image ?? "node:22-bookworm")
          .cpus(2)
          .memory(MiB(2048))
          .workdir("/workspace")
          .envs(opts.env ?? {})
          .detached(true)
          .maxDuration(3600)
          .replace();
        for (const secret of opts.secrets ?? []) {
          builder = builder.secretEnv(secret.envVar, secret.value, secret.allowedHost);
        }
        const sandbox = await builder.create();
        const wrapped = wrap(sandbox);
        if (opts.source) {
          const clone = await wrapped.exec("git", ["clone", "--depth", String(opts.source.depth ?? 1), opts.source.url, "."], { cwd: "/workspace" });
          if (!clone.ok || clone.value.exitCode !== 0) {
            await wrapped.destroy();
            return err(clone.ok
              ? { code: "SANDBOX_CREATE_FAILED", message: clone.value.stderr || "克隆仓库失败" }
              : { ...clone.error, code: "SANDBOX_CREATE_FAILED" });
          }
          if (opts.source.revision) {
            const checkout = await wrapped.exec("git", ["checkout", opts.source.revision], { cwd: "/workspace" });
            if (!checkout.ok || checkout.value.exitCode !== 0) {
              await wrapped.destroy();
              return err(checkout.ok
                ? { code: "SANDBOX_CREATE_FAILED", message: checkout.value.stderr || "检出任务基线失败" }
                : { ...checkout.error, code: "SANDBOX_CREATE_FAILED" });
            }
          }
        }
        return ok(wrapped);
      } catch (cause) {
        return err({ cause, code: "SANDBOX_CREATE_FAILED", message: "创建 microsandbox 失败" });
      }
    },
    async get(name) {
      try {
        const handle = await Microsandbox.get(name);
        const sandbox = handle.status === "running" ? await handle.connect() : await handle.startDetached();
        return ok(wrap(sandbox));
      } catch (cause) {
        return err({ cause, code: "SANDBOX_NOT_FOUND", message: `沙箱 ${name} 不存在或无法恢复` });
      }
    },
  };
}
