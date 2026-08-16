"use client";

import { ArrowLeft, FolderKanban, GitBranch, Loader2, Plus, X } from "lucide-react";
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

interface RepoItem {
  id: string;
  repo: string;
  defaultBranch: string;
}

interface ProjectDetail {
  project: { id: string; name: string; description: string | null };
  repos: RepoItem[];
}

/** 添加仓库对话框：接受 owner/repo 或 GitHub URL，服务端先做 GitHub 可达性校验。 */
function AddRepoDialog({ children, onAdded, projectId }: { children: React.ReactNode; onAdded: () => void; projectId: string }) {
  const [open, setOpen] = useState(false);
  const [repo, setRepo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/repos`, {
        body: JSON.stringify({ repo: repo.trim() }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        setError(body?.error?.message ?? "添加失败，请重试");
        return;
      }
      setOpen(false);
      setRepo("");
      toast.success("仓库已添加");
      onAdded();
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
          <DialogTitle>添加仓库</DialogTitle>
          <DialogDescription>
            输入 owner/repo 或粘贴 GitHub 仓库链接，添加前会校验仓库存在且当前账号可访问。
          </DialogDescription>
        </DialogHeader>
        <Input
          onChange={(e) => setRepo(e.target.value)}
          placeholder="例如：octocat/hello-world 或 https://github.com/octocat/hello-world"
          value={repo}
        />
        {error ? <p className="text-xs text-destructive">{error}</p> : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">取消</Button>
          </DialogClose>
          <Button disabled={!repo.trim() || submitting} onClick={submit}>
            {submitting ? <Loader2 className="animate-spin" /> : null}
            {submitting ? "添加中…" : "添加仓库"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 移除仓库确认框：与删除项目同一套防护规范（outline 取消 + destructive 执行）。 */
function RemoveRepoDialog({ onRemoved, projectId, repo }: { onRemoved: () => void; projectId: string; repo: RepoItem }) {
  const [open, setOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  const confirm = async () => {
    setRemoving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/repos/${repo.id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        toast.error(body?.error?.message ?? "移除失败，请重试");
        return;
      }
      setOpen(false);
      toast.success(`已移除 ${repo.repo}`);
      onRemoved();
    } catch {
      toast.error("网络异常，移除未完成，请重试");
    } finally {
      setRemoving(false);
    }
  };

  return (
    <Dialog onOpenChange={setOpen} open={open}>
      <DialogTrigger asChild>
        <Button aria-label={`移除 ${repo.repo}`} className="rounded-full" size="icon-sm" variant="ghost">
          <X className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>移除仓库</DialogTitle>
          <DialogDescription>
            将把「{repo.repo}」从本项目移除，任务与 Wiki 将不再能使用它。仓库本身不受影响。
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">取消</Button>
          </DialogClose>
          <Button disabled={removing} onClick={confirm} variant="destructive">
            {removing ? <Loader2 className="animate-spin" /> : null}
            {removing ? "移除中…" : "确认移除"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 「即将上线」占位区块（Wiki / 任务接项目仓库集是下一棒）。 */
function ComingSoonSection({ title }: { title: string }) {
  return (
    <section className="rounded-lg border border-dashed bg-card p-6 text-center">
      <p className="text-sm font-bold">{title}</p>
      <p className="mt-1 text-xs text-muted-foreground">即将上线：将基于本项目的仓库集。</p>
    </section>
  );
}

/** 项目详情：仓库列表（增删）+ Wiki/任务占位。 */
export function ProjectDetailView({ id }: { id: string }) {
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(() => {
    fetch(`/api/projects/${id}`)
      .then(async (res) => {
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (res.ok) {
          setDetail((await res.json()) as ProjectDetail);
          return;
        }
        throw new Error(`HTTP ${res.status}`);
      })
      .catch(() => {
        toast.error("项目详情加载失败，请刷新重试");
      });
  }, [id]);

  useEffect(load, [load]);

  if (notFound) {
    return (
      <EmptyState
        action={
          <Button asChild className="mt-2 rounded-full font-bold" size="sm" variant="outline">
            <Link href="/projects">返回项目列表</Link>
          </Button>
        }
        description="项目可能已被删除。"
        icon={FolderKanban}
        title="项目不存在"
      />
    );
  }

  if (detail === null) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="animate-enter flex max-w-2xl flex-col gap-6">
      <div>
        <Link
          className="mb-2 inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
          href="/projects"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          项目
        </Link>
        <h1 className="font-display text-xl font-bold">{detail.project.name}</h1>
        {detail.project.description ? (
          <p className="mt-1 text-sm text-muted-foreground">{detail.project.description}</p>
        ) : null}
      </div>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold">仓库</h2>
          <AddRepoDialog onAdded={load} projectId={id}>
            <Button className="rounded-full font-bold" size="sm" variant="outline">
              <Plus className="h-4 w-4" />
              添加仓库
            </Button>
          </AddRepoDialog>
        </div>
        {detail.repos.length === 0 ? (
          <p className="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
            还没有仓库，添加后任务与 Wiki 就可以使用这个项目了。
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {detail.repos.map((repo) => (
              <li
                className="flex items-center justify-between gap-2 rounded-lg border bg-card p-3 transition-[box-shadow,border-color] hover:border-foreground/15 hover:shadow-card"
                key={repo.id}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <GitBranch className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-bold">{repo.repo}</span>
                  <Badge className="border-transparent bg-primary/10 text-primary">{repo.defaultBranch}</Badge>
                </div>
                <RemoveRepoDialog onRemoved={load} projectId={id} repo={repo} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <ComingSoonSection title="Wiki" />
      <ComingSoonSection title="任务" />
    </div>
  );
}
