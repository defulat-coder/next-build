"use client";

import { Command } from "cmdk";
import { Moon, Search, Sun } from "lucide-react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { NAV_ITEMS } from "@/components/layout/floating-sidebar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { toggleTheme, useTheme } from "@/lib/theme";

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
 * ⌘K 命令面板骨架 + 1-4 数字键页面导航。
 * 面板内当前只承载页面跳转与主题切换，后续动作（新建任务等）往 Command.Item 里加。
 */
export function CommandMenu() {
  const router = useRouter();
  const theme = useTheme();
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
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogContent
        className="top-[22%] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-md"
        showCloseButton={false}
      >
        <DialogTitle className="sr-only">命令面板</DialogTitle>
        <Command label="命令面板" loop>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Command.Input
              className="h-11 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              placeholder="跳转页面或执行命令…"
            />
            <kbd className="rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
              esc
            </kbd>
          </div>
          <Command.List className="max-h-72 overflow-y-auto p-1.5">
            <Command.Empty className="py-6 text-center text-sm text-muted-foreground">
              没有匹配的命令
            </Command.Empty>
            <Command.Group
              className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
              heading="页面"
            >
              {NAV_ITEMS.map((item, index) => {
                const Icon = item.icon;
                return (
                  <Command.Item
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-foreground select-none data-[selected=true]:bg-accent"
                    key={item.href}
                    onSelect={() => go(item.href)}
                    value={item.label}
                  >
                    <Icon className="h-4 w-4 text-muted-foreground" />
                    {item.label}
                    <kbd className="ml-auto rounded-md border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
                      {index + 1}
                    </kbd>
                  </Command.Item>
                );
              })}
            </Command.Group>
            <Command.Group
              className="text-xs text-muted-foreground [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5"
              heading="偏好"
            >
              <Command.Item
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm text-foreground select-none data-[selected=true]:bg-accent"
                onSelect={() => {
                  setOpen(false);
                  toggleTheme(theme);
                }}
                value="切换主题"
              >
                {theme === "dark" ? (
                  <Sun className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Moon className="h-4 w-4 text-muted-foreground" />
                )}
                切换为{theme === "dark" ? "浅色" : "深色"}主题
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
