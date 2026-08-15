/**
 * 沙箱层窄接口（见 PRODUCT.md「创建任务」）：任务工作区的创建、命令执行、文件读写与销毁。
 * 第一个实现为 microsandbox，业务代码只依赖本接口，便于将来替换实现。
 */

export interface SandboxCreateOptions {
  /** 沙箱名称，项目内唯一；对应一个任务。 */
  name: string;
  /** 注入沙箱的环境变量（如 ANTHROPIC_API_KEY、GITHUB_TOKEN）。 */
  env?: Record<string, string>;
  /** 创建时克隆的 git 仓库源；URL 可内嵌凭据。 */
  source?: {
    url: string;
    /** 浅克隆深度，大仓库建议 1 */
    depth?: number;
    /** 分支或 commit */
    revision?: string;
  };
}

export interface ExecOptions {
  cwd?: string;
  env?: Record<string, string>;
  /** true 时立即返回（exitCode 为 null），进程在沙箱内后台运行。 */
  detached?: boolean;
}

export interface ExecResult {
  /** detached 模式下为 null，表示进程仍在运行。 */
  exitCode: number | null;
  stdout: string;
  stderr: string;
}

export interface Sandbox {
  readonly name: string;
  exec(command: string, args?: string[], opts?: ExecOptions): Promise<ExecResult>;
  readFile(path: string): Promise<Uint8Array | null>;
  writeFile(path: string, content: Uint8Array | string): Promise<void>;
  /** 销毁沙箱并释放资源；幂等。 */
  destroy(): Promise<void>;
}

export interface SandboxProvider {
  create(opts: SandboxCreateOptions): Promise<Sandbox>;
  /** 按名称取回已存在的沙箱（如任务中断后恢复）。 */
  get(name: string): Promise<Sandbox>;
}
