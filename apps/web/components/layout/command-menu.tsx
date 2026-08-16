"use client";

import { Moon, Sun } from "lucide-react";
import type { Route } from "next";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { NAV_ITEMS } from "@/components/layout/floating-sidebar";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
} from "@/components/ui/command";

/** 输入控件聚焦时不拦截数字键等导航快捷键。 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

/**
 * ⌘K 命令面板（shadcn 官方 command 组件）+ 1-4 数字键页面导航。
 * 面板内当前只承载页面跳转与主题切换，后续动作（新建任务等）往 CommandItem 里加。
 */
export function CommandMenu() {
  const router = useRouter();
  const { resolvedTheme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      // 数字键 1-4 直达导航：仅在无修饰键、非输入态、面板未打开时生效
      if (open || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey || isEditableTarget(e.target)) return;
      const index = Number(e.key) - 1;
      if (index >= 0 && index < NAV_ITEMS.length) {
        router.push(NAV_ITEMS[index].href as Route);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, router]);

  const go = (href: Route) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <CommandDialog
      description="跳转页面或执行命令"
      onOpenChange={setOpen}
      open={open}
      title="命令面板"
    >
      {/* radix-nova 版 CommandDialog 不内置 <Command> 根（cmdk 的 store context 由它提供），
          缺了会让 CommandInput 读不到 store 直接崩溃，必须自行组合。 */}
      <Command loop>
        <CommandInput placeholder="跳转页面或执行命令…" />
        <CommandList>
          <CommandEmpty>没有匹配的命令</CommandEmpty>
          <CommandGroup heading="页面">
            {NAV_ITEMS.map((item, index) => {
              const Icon = item.icon;
              return (
                <CommandItem key={item.href} onSelect={() => go(item.href)} value={item.label}>
                  <Icon />
                  {item.label}
                  <CommandShortcut>{index + 1}</CommandShortcut>
                </CommandItem>
              );
            })}
          </CommandGroup>
          <CommandGroup heading="偏好">
            <CommandItem
              onSelect={() => {
                setOpen(false);
                setTheme(resolvedTheme === "dark" ? "light" : "dark");
              }}
              value="切换主题"
            >
              {resolvedTheme === "dark" ? <Sun /> : <Moon />}
              切换为{resolvedTheme === "dark" ? "浅色" : "深色"}主题
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}
