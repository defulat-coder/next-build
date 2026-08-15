"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";

/* <html data-theme> 是 React 之外的外部状态（由 layout 内联脚本初始化），
   用 useSyncExternalStore 订阅，避免 hydration 不一致。 */
const listeners = new Set<() => void>();

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

function getSnapshot(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** 服务端快照固定为 light（默认值），客户端水合后会按真实主题重渲染。 */
function getServerSnapshot(): Theme {
  return "light";
}

/** 浅色（默认）/ 深色切换：写 localStorage 并同步 <html data-theme>，初始值跟随系统。 */
export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    window.localStorage.setItem("theme", next);
    for (const listener of listeners) listener();
  };

  return (
    <Button
      aria-label="切换主题"
      className="rounded-full"
      onClick={toggle}
      size="icon"
      variant="ghost"
    >
      {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  );
}
