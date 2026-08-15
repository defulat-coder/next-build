import { Zap } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

/*
 * 方向契约（impeccable，seed 5902e40d，用户锁定 split-statement，code-led）：
 * THESIS: 登录页把产品机制（任务→分支→人工合并）作为第一屏声明，拒绝居中表单的 SaaS 默认。
 * OWN-WORLD: personal-sites 灰阶（白底/墨色/细灰线），SF Pro 紧凑字距，胶囊按钮，发丝分隔线。
 * STORY: 访客三秒内明白这是任务驱动的内部研发平台，用飞书账号进入。
 * FIRST VIEWPORT: 左 7/12 大字声明（上 wordmark、中三行声明、下脚注），右 5/12 发丝线隔开的安静动作区。
 * FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md.
 */

/** 回调失败时 /login?error=<code> 的文案映射（见 lib/auth/routes.ts 的 loginFailed）。 */
const ERROR_MESSAGES: Record<string, string> = {
  FEISHU_TOKEN_EXCHANGE_FAILED: "飞书授权失败，请重试；反复出现请联系管理员检查应用配置。",
  FEISHU_USER_INFO_FAILED: "获取飞书用户信息失败，请重试。",
  STATE_MISMATCH: "登录状态校验失败（可能链接已过期），请重新发起登录。",
};

const STATEMENT_LINES = ["任务即分支。", "Agent 在沙箱里完成研发。", "merge 键始终在你手里。"];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage = (error && ERROR_MESSAGES[error]) ?? (error ? "登录失败，请重试。" : null);

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[7fr_5fr]">
      {/* 方向契约随构建产物存活（HTML 注释，审计用） */}
      <span
        dangerouslySetInnerHTML={{
          __html:
            "<!-- direction-contract: split-statement · seed 5902e40d · code-led · THESIS 机制声明即首屏 -->",
        }}
        hidden
      />

      {/* 左：产品声明 */}
      <section className="flex min-h-[42vh] flex-col justify-between gap-10 p-8 lg:min-h-0 lg:p-14">
        <span className="font-display text-sm font-bold tracking-tight">Next Build</span>
        <h1 className="font-display text-3xl leading-[1.15] font-bold tracking-[-0.03em] text-pretty sm:text-4xl lg:text-6xl">
          {STATEMENT_LINES.map((line, i) => (
            <span
              className="animate-slideUp block"
              key={line}
              style={{ animationDelay: `${i * 90}ms`, animationFillMode: "both" }}
            >
              {line}
            </span>
          ))}
        </h1>
        <p className="text-muted-foreground text-xs">内部研发平台 · 使用团队飞书账号登录</p>
      </section>

      {/* 右：登录动作区 */}
      <section className="border-border flex items-center justify-center border-t p-8 lg:border-t-0 lg:border-l">
        <div className="flex w-full max-w-xs flex-col items-center gap-6 text-center">
          <span className="bg-primary flex h-12 w-12 items-center justify-center rounded-full">
            <Zap className="text-primary-foreground h-5 w-5" />
          </span>
          <div className="flex flex-col gap-1">
            <p className="font-display text-lg font-bold tracking-tight">登录 Next Build</p>
            <p className="text-muted-foreground text-sm">以任务为单位驱动 AI Agent 完成研发工作</p>
          </div>
          {errorMessage ? (
            <p className="bg-destructive-bg text-destructive-text w-full rounded-lg px-3 py-2 text-left text-xs" role="alert">
              {errorMessage}
            </p>
          ) : null}
          {/* 目标是 API 端点（302 跳飞书授权页），必须用原生 <a> 整页跳转，不能用 Link */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            className={buttonVariants({ className: "w-full rounded-full font-bold", size: "lg" })}
            href="/api/auth/feishu"
          >
            飞书登录
          </a>
        </div>
      </section>
    </main>
  );
}
