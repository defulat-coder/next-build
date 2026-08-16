import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

/** 回调失败时 /login?error=<code> 的文案映射（见 server/interface/http/auth.routes.ts 回调分支）。 */
const ERROR_MESSAGES: Record<string, string> = {
  FEISHU_TOKEN_EXCHANGE_FAILED: "飞书授权失败，请重试；反复出现请联系管理员检查应用配置。",
  FEISHU_USER_INFO_FAILED: "获取飞书用户信息失败，请重试。",
  STATE_MISMATCH: "登录状态校验失败（可能链接已过期），请重新发起登录。",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const errorMessage =
    (error && ERROR_MESSAGES[error]) ?? (error ? "登录失败，请重试。" : null);

  return (
    <Card className="p-6">
      <div className="flex flex-col space-y-2 text-left">
        <h1 className="text-2xl font-semibold tracking-tight">登录</h1>
        <p className="text-muted-foreground text-sm">
          以任务为单位驱动 AI Agent 完成研发工作
        </p>
      </div>
      {errorMessage ? (
        <p
          className="bg-destructive/10 text-destructive mt-4 rounded-lg px-3 py-2 text-sm"
          role="alert"
        >
          {errorMessage}
        </p>
      ) : null}
      {/* 目标是 API 端点（302 跳飞书授权页），必须用原生 <a> 整页跳转，不能用 Link */}
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
      <a
        className={buttonVariants({ className: "mt-6 w-full", size: "lg" })}
        href="/api/auth/feishu"
      >
        飞书登录
      </a>
    </Card>
  );
}
