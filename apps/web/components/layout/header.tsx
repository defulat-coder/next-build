import { Plus, Zap } from "lucide-react";
import Link from "next/link";

import { TaskCreateDialog } from "@/components/layout/task-create-dialog";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function Header() {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-border bg-background/80 px-6 backdrop-blur">
      <Link className="flex items-center gap-2.5" href="/tasks">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
          <Zap className="h-4 w-4 text-primary-foreground" />
        </span>
        <span className="font-display text-base font-bold tracking-tight">Next Build</span>
      </Link>

      <div className="ml-6 hidden md:block">
        <Input
          className="w-64 rounded-full transition-all duration-200 focus:w-80"
          disabled
          placeholder="搜索任务、Wiki…"
          title="搜索即将上线"
        />
      </div>

      <div className="ml-auto flex items-center gap-2">
        <TaskCreateDialog>
          <Button className="rounded-full font-bold" size="sm">
            <Plus className="h-4 w-4" />
            新建任务
          </Button>
        </TaskCreateDialog>
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
