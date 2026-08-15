"use client";

import { BookOpen, ListTodo, MessageSquareText } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/tasks", label: "任务", icon: ListTodo },
  { href: "/wiki", label: "Wiki", icon: BookOpen },
  { href: "/ask-ai", label: "Ask AI", icon: MessageSquareText },
] as const;

/** Lovart 风格悬浮导航栏：fixed 定位不占布局，纯图标 + tooltip。 */
export function FloatingSidebar() {
  const pathname = usePathname();

  return (
    <nav className="fixed top-1/2 left-3 z-50 -translate-y-1/2">
      <div className="flex flex-col gap-1.5 rounded-2xl border border-border/50 bg-card/90 p-1.5 shadow-xl backdrop-blur-xl">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Tooltip key={item.href}>
              <TooltipTrigger asChild>
                <Link
                  aria-label={item.label}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-200",
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                  href={item.href}
                >
                  <Icon className="h-4.5 w-4.5" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{item.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </nav>
  );
}
