"use client";

import { FolderGit2, GitBranch, MoreVertical, Pencil, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { readApiError } from "@/lib/api-error";

/** GET /api/projects/:id 的响应（packages/db Project/ProjectRepo；日期经 JSON 序列化为字符串）。 */
interface ProjectDetailDto {
  project: {
    id: string;
    name: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
  };
  repos: {
    id: string;
    repo: string;
    defaultBranch: string;
    addedAt: string;
  }[];
}

export function ProjectDetailView({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [detail, setDetail] = React.useState<ProjectDetailDto | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      if (!res.ok) {
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        setLoadError(await readApiError(res));
        return;
      }
      setDetail(await res.json());
    } catch {
      setLoadError("网络异常，请重试。");
    }
  }, [projectId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (notFound) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center">
        <FolderGit2 className="text-muted-foreground size-8" />
        <p className="font-medium">项目不存在</p>
        <p className="text-muted-foreground text-sm">它可能已被删除。</p>
        <Button asChild variant="outline" className="mt-2">
          <Link href="/projects">返回项目列表</Link>
        </Button>
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={detail?.project.name ?? "项目详情"}
        description={detail?.project.description ?? undefined}
        actions={
          detail ? (
            <div className="flex items-center gap-2">
              <EditProjectDialog project={detail.project} onSaved={load} />
              <DeleteProjectAction
                projectId={projectId}
                projectName={detail.project.name}
                onDeleted={() => router.push("/projects")}
              />
            </div>
          ) : null
        }
      />

      {loadError ? (
        <p className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm" role="alert">
          {loadError}
        </p>
      ) : null}

      {detail === null && !loadError ? (
        <p className="text-muted-foreground text-sm">加载中…</p>
      ) : detail ? (
        <RepoSection projectId={projectId} repos={detail.repos} onChanged={load} />
      ) : null}
    </>
  );
}

function RepoSection({
  projectId,
  repos,
  onChanged,
}: {
  projectId: string;
  repos: ProjectDetailDto["repos"];
  onChanged: () => void;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">仓库（{repos.length}）</h3>
        <AddRepoDialog projectId={projectId} onAdded={onChanged} />
      </div>

      {repos.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed py-16 text-center">
          <FolderGit2 className="text-muted-foreground size-8" />
          <p className="text-muted-foreground text-sm">还没有仓库，添加第一个 GitHub 仓库。</p>
        </div>
      ) : (
        <ul className="grid gap-2">
          {repos.map((repo) => (
            <RepoRow key={repo.id} projectId={projectId} repo={repo} onRemoved={onChanged} />
          ))}
        </ul>
      )}
    </section>
  );
}

function RepoRow({
  projectId,
  repo,
  onRemoved,
}: {
  projectId: string;
  repo: ProjectDetailDto["repos"][number];
  onRemoved: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [removing, setRemoving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleRemove() {
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/repos/${repo.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }
      setConfirmOpen(false);
      onRemoved();
    } catch {
      setError("网络异常，请重试。");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <li className="rounded-xl border p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="truncate font-mono text-sm font-medium">{repo.repo}</span>
          <span className="bg-primary/10 text-primary inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs">
            <GitBranch className="size-3" />
            {repo.defaultBranch}
          </span>
          <span className="text-muted-foreground shrink-0 text-xs">
            添加于 {new Date(repo.addedAt).toLocaleDateString("zh-CN")}
          </span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          onClick={() => setConfirmOpen(true)}
          aria-label={`移除 ${repo.repo}`}
        >
          <Trash2 />
        </Button>
      </div>
      {error ? (
        <p className="bg-destructive/10 text-destructive mt-2 rounded-lg px-3 py-2 text-sm" role="alert">
          {error}
        </p>
      ) : null}

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="移除仓库"
        desc={`确定把 ${repo.repo} 从项目中移除吗？GitHub 上的仓库不受影响。`}
        cancelBtnText="取消"
        confirmText="移除"
        destructive
        isLoading={removing}
        handleConfirm={handleRemove}
      />
    </li>
  );
}

function AddRepoDialog({ projectId, onAdded }: { projectId: string; onAdded: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [repo, setRepo] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/repos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ repo }),
      });
      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }
      setOpen(false);
      setRepo("");
      onAdded();
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
          添加仓库
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>添加仓库</DialogTitle>
            <DialogDescription>
              输入 owner/repo 或粘贴 GitHub 仓库 URL，添加前会校验仓库存在且可访问。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="repo-input">仓库</Label>
              <Input
                id="repo-input"
                value={repo}
                onChange={(e) => setRepo(e.target.value)}
                placeholder="owner/repo 或 https://github.com/owner/repo"
                required
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
              {submitting ? "校验并添加中…" : "添加"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditProjectDialog({
  project,
  onSaved,
}: {
  project: ProjectDetailDto["project"];
  onSaved: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState(project.name);
  const [description, setDescription] = React.useState(project.description ?? "");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || undefined }),
      });
      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }
      setOpen(false);
      onSaved();
    } catch {
      setError("网络异常，请重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <Pencil />
          编辑
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>编辑项目</DialogTitle>
            <DialogDescription>修改项目名称与描述。</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="edit-project-name">名称</Label>
              <Input
                id="edit-project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={50}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="edit-project-description">描述（可选）</Label>
              <Textarea
                id="edit-project-description"
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
              {submitting ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteProjectAction({
  projectId,
  projectName,
  onDeleted,
}: {
  projectId: string;
  projectName: string;
  onDeleted: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}`, { method: "DELETE" });
      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }
      onDeleted();
    } catch {
      setError("网络异常，请重试。");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label="更多操作">
            <MoreVertical />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            onSelect={() => setOpen(true)}
          >
            <Trash2 />
            删除项目
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="删除项目"
        desc={
          <>
            确定删除项目「{projectName}」吗？其仓库配置会一并删除，此操作不可恢复。
            {error ? (
              <span className="bg-destructive/10 text-destructive mt-2 block rounded-lg px-3 py-2" role="alert">
                {error}
              </span>
            ) : null}
          </>
        }
        cancelBtnText="取消"
        confirmText="删除"
        destructive
        isLoading={deleting}
        handleConfirm={handleDelete}
      />
    </>
  );
}
