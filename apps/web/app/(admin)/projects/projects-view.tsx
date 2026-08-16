"use client";

import { FolderGit2, Plus } from "lucide-react";
import * as React from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
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
  createdAt: string;
}

/** API 错误体（AGENTS.md 异常约定）：业务异常 message 可直接展示。 */
interface ApiErrorBody {
  error: { code: string; message: string };
}

async function readApiError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  return body?.error.message ?? "请求失败，请重试。";
}

export function ProjectsView() {
  const [projects, setProjects] = React.useState<ProjectSummaryDto[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

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
        actions={<CreateProjectDialog onCreated={load} />}
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
            <Card key={project.id}>
              <CardHeader>
                <CardTitle>{project.name}</CardTitle>
                {project.description ? (
                  <CardDescription>{project.description}</CardDescription>
                ) : null}
              </CardHeader>
              <CardContent className="text-muted-foreground text-sm">
                {project.repoCount} 个仓库
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}

function CreateProjectDialog({ onCreated }: { onCreated: () => void }) {
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
      setOpen(false);
      setName("");
      setDescription("");
      onCreated();
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
