import { z } from "zod";

/**
 * 服务端环境变量校验：启动/首次访问时即报错，而不是运行到一半才炸。
 * 仅服务端使用，绝不能加 NEXT_PUBLIC_ 前缀。
 */
const serverEnvSchema = z.object({
  /** Claude Agent SDK 使用的 Anthropic API key */
  ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY 未配置"),
  /** GitHub fine-grained PAT：克隆仓库、推送任务分支、开 Draft PR */
  GITHUB_TOKEN: z.string().min(1, "GITHUB_TOKEN 未配置"),
  /** 默认目标仓库，格式 owner/repo */
  GITHUB_REPO: z
    .string()
    .regex(/^[\w.-]+\/[\w.-]+$/, "GITHUB_REPO 必须是 owner/repo 格式"),
});

export type ServerEnv = z.infer<typeof serverEnvSchema>;

let cached: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (!cached) {
    const result = serverEnvSchema.safeParse(process.env);
    if (!result.success) {
      throw new Error(
        `环境变量校验失败：${result.error.issues.map((i) => i.message).join("；")}。请对照 apps/web/.env.example 配置。`,
      );
    }
    cached = result.data;
  }
  return cached;
}
