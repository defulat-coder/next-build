"use client";

import { CircleAlert, CircleCheck, CircleDashed, FolderGit2, GitFork, Plus } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { PageHeader } from "@/components/layout/page-header";
import { usePermissions } from "@/components/permissions-provider";
import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/api-error";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/** GET /api/projects 的列表项（packages/db ProjectSummary；日期经 JSON 序列化为字符串）。 */
interface ProjectSummaryDto {
  id: string;
  name: string;
  description: string | null;
  repoCount: number;
  readiness: "setup_required" | "ready" | "needs_attention";
  primaryRepo: { repo: string } | null;
  createdAt: string;
}

export function ProjectsView() {
  const [projects, setProjects] = React.useState<ProjectSummaryDto[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const { hasPermission } = usePermissions();

  const load = React.useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) {
        setLoadError(await readApiError(res));
        return;
      }
      setProjects(await res.json());
    } catch {
      setLoadError("网络异常，请重试。");
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader
        title="项目"
        description="项目是仓库的容器，任务与 Wiki 的归属单位。"
        actions={hasPermission("project:create") ? <CreateProjectDialog /> : undefined}
      />

      {loadError ? (
        <p className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm" role="alert">
          {loadError}
        </p>
      ) : null}

      {projects === null && !loadError ? (
        <p className="text-muted-foreground text-sm">加载中…</p>
      ) : projects !== null && projects.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center">
          <FolderGit2 className="text-muted-foreground size-8" />
          <p className="font-medium">还没有项目</p>
          <p className="text-muted-foreground text-sm">创建第一个项目，然后为它配置 GitHub 仓库。</p>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects?.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`} className="block">
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader className="gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <CardTitle className="min-w-0 truncate">{project.name}</CardTitle>
                    <ReadinessBadge readiness={project.readiness} />
                  </div>
                  <CardDescription className="line-clamp-2 min-h-10">
                    {project.description || "暂无描述"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm">
                  <span className="text-muted-foreground flex items-center gap-2">
                    <GitFork className="size-4" />
                    {project.repoCount} 个仓库
                  </span>
                  <span className="text-muted-foreground truncate">
                    主仓库：
                    <span className="text-foreground font-mono">
                      {project.primaryRepo?.repo ?? "未配置"}
                    </span>
                  </span>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}

function ReadinessBadge({ readiness }: { readiness: ProjectSummaryDto["readiness"] }) {
  const content = {
    setup_required: { icon: CircleDashed, label: "待配置", className: "bg-muted text-muted-foreground" },
    ready: { icon: CircleCheck, label: "已就绪", className: "bg-success/10 text-success" },
    needs_attention: { icon: CircleAlert, label: "需处理", className: "bg-destructive/10 text-destructive" },
  }[readiness];
  const Icon = content.icon;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${content.className}`}>
      <Icon className="size-3.5" />
      {content.label}
    </span>
  );
}

function CreateProjectDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || undefined }),
      });
      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }
      const project = (await res.json()) as { id: string };
      setOpen(false);
      router.push(`/projects/${project.id}/repos` as Route);
    } catch {
      setError("网络异常，请重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus />
          新建项目
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
            <DialogDescription>项目下可配置多个 GitHub 仓库，作为任务与 Wiki 的工作区。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="project-name">名称</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="project-description">描述（可选）</Label>
              <Textarea
                id="project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={200}
              />
            </div>
            {error ? (
              <p className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={submitting}>
              {submitting ? "创建中…" : "创建"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
