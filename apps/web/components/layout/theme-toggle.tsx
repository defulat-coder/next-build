"use client";

import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toggleTheme, useTheme } from "@/lib/theme";

/** 浅色（默认）/ 深色切换：主题状态由 lib/theme.ts 统一管理（Toaster、命令面板共享订阅）。 */
export function ThemeToggle() {
  const theme = useTheme();

  return (
    <Button
      aria-label="切换主题"
      className="rounded-full"
      onClick={() => toggleTheme(theme)}
      size="icon"
      variant="ghost"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
