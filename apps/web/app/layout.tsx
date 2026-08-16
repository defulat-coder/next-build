import type { Metadata } from "next";

import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";

import "./globals.css";

export const metadata: Metadata = {
  description:
    "Next Build：任务驱动的内部研发平台。描述研发需求，Agent 在独立沙箱中完成并产出任务分支 + Draft PR，由你审核后合并。",
  title: "Next Build",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        <script
          // 首帧绘制前恢复主题（localStorage 优先，否则跟随系统），避免深色用户首帧白屏。
          dangerouslySetInnerHTML={{
            __html:
              'try{var t=window.localStorage.getItem("theme");if(t!=="light"&&t!=="dark")t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch{}',
          }}
        />
      </head>
      <body>
        <TooltipProvider>{children}</TooltipProvider>
        <Toaster />
      </body>
    </html>
  );
}
