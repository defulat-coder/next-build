import { z } from "zod";

/**
 * 服务端环境变量校验：按功能域拆分，谁用谁校验——用到该功能的第一个请求即报错，
 * 而不是缺了无关功能的 key 就全站 500，也不是运行到一半才炸。
 * 仅服务端使用，绝不能加 NEXT_PUBLIC_ 前缀。
 */

function makeEnvGetter<T extends z.ZodRawShape>(schema: z.ZodObject<T>) {
  let cached: z.infer<z.ZodObject<T>> | undefined;
  return () => {
    if (!cached) {
      const result = schema.safeParse(process.env);
      if (!result.success) {
        throw new Error(
          `环境变量校验失败：${result.error.issues.map((i) => i.message).join("；")}。请对照 apps/web/.env.example 配置。`,
        );
      }
      cached = result.data;
    }
    return cached;
  };
}

/** 飞书自建应用凭证（OAuth 登录）。 */
export const getFeishuEnv = makeEnvGetter(
  z.object({
    FEISHU_APP_ID: z.string().min(1, "FEISHU_APP_ID 未配置"),
    FEISHU_APP_SECRET: z.string().min(1, "FEISHU_APP_SECRET 未配置"),
  }),
);

/** GitHub 凭证（多仓库校验、克隆、推送任务分支、开 Draft PR）。 */
export const getGitHubEnv = makeEnvGetter(
  z.object({
    /** GitHub fine-grained PAT */
    GITHUB_TOKEN: z.string().min(1, "GITHUB_TOKEN 未配置"),
  }),
);

/** Claude Agent SDK 使用的 Anthropic API key。 */
export const getAnthropicEnv = makeEnvGetter(
  z.object({
    ANTHROPIC_API_KEY: z.string().min(1, "ANTHROPIC_API_KEY 未配置"),
  }),
);
