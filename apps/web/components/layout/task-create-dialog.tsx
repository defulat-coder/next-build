"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";

/** 新建任务对话框。创建链路（沙箱 + Agent）尚未接入，提交按钮暂为禁用预览态。 */
export function TaskCreateDialog({ children }: { children: React.ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建任务</DialogTitle>
          <DialogDescription>
            描述研发需求，Agent 会在独立沙箱中完成，产出任务分支 + Draft PR，由你审核后合并。
          </DialogDescription>
        </DialogHeader>
        <Textarea placeholder="例如：给任务列表加分页…" rows={4} />
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">取消</Button>
          </DialogClose>
          <Button disabled title="任务创建链路开发中">
            创建任务
          </Button>
        </DialogFooter>
        <p className="text-xs text-muted-foreground">任务创建链路开发中，当前为界面预览。</p>
      </DialogContent>
    </Dialog>
  );
}
