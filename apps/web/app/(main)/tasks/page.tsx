import { ListTodo, Plus } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { TaskCreateDialog } from "@/components/layout/task-create-dialog";
import { Button } from "@/components/ui/button";

export const metadata = { title: "任务 · Next Build" };

export default function TasksPage() {
  return (
    <EmptyState
      action={
        <TaskCreateDialog>
          <Button className="mt-2 rounded-full font-bold" size="sm">
            <Plus className="h-4 w-4" />
            新建任务
          </Button>
        </TaskCreateDialog>
      }
      description="创建一个任务，让 Agent 在独立沙箱中完成研发工作，产出以任务分支 + Draft PR 的形式交付。"
      icon={ListTodo}
      title="暂无任务"
    />
  );
}
