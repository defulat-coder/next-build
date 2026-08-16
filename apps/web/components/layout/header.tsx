import { Plus, Zap } from "lucide-react";
import Link from "next/link";

import { TaskCreateDialog } from "@/components/layout/task-create-dialog";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { UserMenu } from "@/components/layout/user-menu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function Header() {
  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-4 border-b border-border bg-background/80 px-6 backdrop-blur">
      <Link className="flex items-center gap-2.5" href="/tasks">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary">
          <Zap className="h-4 w-4 text-primary-foreground" />
        </span>
        <span className="font-display text-base font-bold tracking-tight">Next Build</span>
      </Link>

      <div className="ml-auto flex items-center gap-2">
        {/* 创建链路未接入前降级为次级按钮 + 即将上线 badge（对话框保留为界面预览） */}
        <TaskCreateDialog>
          <Button size="sm" variant="outline">
            <Plus className="h-4 w-4" />
            新建任务
            <Badge className="border-transparent bg-primary/10 text-primary">即将上线</Badge>
          </Button>
        </TaskCreateDialog>
        <ThemeToggle />
        <UserMenu />
      </div>
    </header>
  );
}
