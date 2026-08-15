import { Zap } from "lucide-react";

import { buttonVariants } from "@/components/ui/button";

/** 登录页：在 (main) 组之外，不带 AppLayout。 */
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-6">
      <div className="flex w-full max-w-xs flex-col items-center gap-8 text-center">
        <div className="flex flex-col items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            <Zap className="h-5 w-5 text-primary-foreground" />
          </span>
          <h1 className="font-display text-xl font-bold tracking-tight">Next Build</h1>
          <p className="text-sm text-muted-foreground">以任务为单位驱动 AI Agent 完成研发工作</p>
        </div>
        {/* 目标是 API 端点（302 跳飞书授权页），必须用原生 <a> 整页跳转，不能用 Link */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a
          className={buttonVariants({ className: "w-full rounded-full font-bold", size: "lg" })}
          href="/api/auth/feishu"
        >
          飞书登录
        </a>
      </div>
    </main>
  );
}
