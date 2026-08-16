import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";

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
      <body>
        {/*
          next-themes 官方主题方案（shadcn 标准）：attribute="data-theme" 与
          globals.css 的 html[data-theme="dark"] token 选择器兼容；自带防闪烁内联脚本，
          localStorage key 为 "theme"（与旧机制一致，用户存量偏好无损迁移）。
        */}
        <ThemeProvider attribute="data-theme" defaultTheme="system" enableSystem>
          <TooltipProvider>{children}</TooltipProvider>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
