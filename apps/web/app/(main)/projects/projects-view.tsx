"use client";

import { FolderKanban, Loader2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/empty-state";
import { Badge } from "@/components/ui/badge";
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
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";

interface ProjectItem {
  id: string;
  name: string;
  description: string | null;
  repoCount: number;
}

/** 新建项目对话框：名称 + 描述，失败时内联展示 API 返回的 message。 */
function CreateProjectDialog({ children, onCreated }: { children: React.ReactNode; onCreated: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        body: JSON.stringify({ description: description.trim() || undefined, name: name.trim() }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? "创建失败，请重试");
        return;
      }
      setOpen(false);
      setName("");
      setDescription("");
      toast.success("项目已创建");
      onCreated();
    } catch {
      setError("网络异常，请重试");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>新建项目</DialogTitle>
          <DialogDescription>项目是仓库的容器：任务与 Wiki 都挂在项目下。</DialogDescription>
        </DialogHeader>
        <Input
          onChange={(e) => setName(e.target.value)}
          placeholder="项目名称"
          value={name}
        />
        <Textarea
          onChange={(e) => setDescription(e.target.value)}
          placeholder="描述（可选）"
          rows={3}
          value={description}
        />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">取消</Button>
          </DialogClose>
          <Button disabled={!name.trim() || submitting} onClick={submit}>
            {submitting ? <Loader2 className="animate-spin" /> : null}
            {submitting ? "创建中…" : "创建项目"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 删除项目确认框：outline 取消 + destructive 确认（控件规范）。 */
function DeleteProjectDialog({ onDeleted, project }: { onDeleted: () => void; project: ProjectItem }) {
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const confirm = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast.error(body?.error?.message ?? "删除失败，请重试");
        return;
      }
      setOpen(false);
      toast.success(`项目「${project.name}」已删除`);
      onDeleted();
    } catch {
      toast.error("网络异常，删除未完成，请重试");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button aria-label={`删除 ${project.name}`} className="rounded-full" size="icon-sm" variant="ghost">
          <Trash2 className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>删除项目</DialogTitle>
          <DialogDescription>
            将删除项目「{project.name}」及其仓库配置，操作不可撤销。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">取消</Button>
          </DialogClose>
          <Button disabled={deleting} onClick={confirm} variant="destructive">
            {deleting ? <Loader2 className="animate-spin" /> : null}
            {deleting ? "删除中…" : "确认删除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 项目列表：卡片网格（名称 / 描述 / 仓库数 badge），空态走 EmptyState。 */
export function ProjectsView() {
  const [projects, setProjects] = useState<ProjectItem[] | null>(null);

  const load = useCallback(() => {
    fetch("/api/projects")
      .then((res) => (res.ok ? (res.json() as Promise<ProjectItem[]>) : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then(setProjects)
      .catch(() => {
        setProjects([]);
        toast.error("项目列表加载失败，请刷新重试");
      });
  }, []);

  useEffect(load, [load]);

  if (projects === null) {
    return (
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <Skeleton className="h-28 rounded-lg" key={i} />
        ))}
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <EmptyState
        action={
          <CreateProjectDialog onCreated={load}>
            <Button className="mt-2 rounded-full font-bold" size="sm">
              <Plus className="h-4 w-4" />
              新建项目
            </Button>
          </CreateProjectDialog>
        }
        description="项目是仓库的容器：把 GitHub 仓库挂进项目，任务与 Wiki 都归属到项目。"
        icon={FolderKanban}
        title="暂无项目"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-xl font-bold">项目</h1>
        <CreateProjectDialog onCreated={load}>
          <Button className="rounded-full font-bold" size="sm">
            <Plus className="h-4 w-4" />
            新建项目
          </Button>
        </CreateProjectDialog>
      </div>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((project, index) => (
          <div
            className="animate-enter rounded-lg border bg-card p-4 transition-[box-shadow,border-color] hover:border-foreground/15 hover:shadow-card"
            key={project.id}
            style={{ animationDelay: `${Math.min(index * 40, 200)}ms` }}
          >
            <div className="flex items-start justify-between gap-2">
              <Link className="min-w-0 flex-1" href={`/projects/${project.id}`}>
                <p className="truncate font-bold">{project.name}</p>
                <p className="mt-1 line-clamp-2 min-h-5 text-sm text-muted-foreground">
                  {project.description ?? ""}
                </p>
              </Link>
              <DeleteProjectDialog onDeleted={load} project={project} />
            </div>
            {project.repoCount > 0 ? (
              <Badge className="mt-3 border-transparent bg-primary/10 text-primary">{project.repoCount} 个仓库</Badge>
            ) : (
              <Badge className="mt-3" variant="outline">暂无仓库</Badge>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
