import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

/* <html data-theme> 是 React 之外的外部状态（由 layout 内联脚本初始化），
   用 useSyncExternalStore 订阅，避免 hydration 不一致。
   ThemeToggle / Toaster / 命令面板共用这一份订阅，切换时全部同步。 */
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

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** 切换主题：写 localStorage 并同步 <html data-theme>，通知所有订阅者。 */
export function setTheme(next: Theme) {
  document.documentElement.dataset.theme = next;
  window.localStorage.setItem("theme", next);
  for (const listener of listeners) listener();
}

export function toggleTheme(current: Theme) {
  setTheme(current === "dark" ? "light" : "dark");
}
