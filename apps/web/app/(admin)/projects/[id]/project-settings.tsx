"use client";

import { useRouter } from "next/navigation";
import * as React from "react";

import { ConfirmDialog } from "@/components/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { readApiError } from "@/lib/api-error";

import type { ProjectDetailDto } from "./project-types";

export function ProjectSettings({
  project,
  canUpdate,
  canDelete,
  onChanged,
}: {
  project: ProjectDetailDto["project"];
  canUpdate: boolean;
  canDelete: boolean;
  onChanged: () => void;
}) {
  return (
    <div className="grid max-w-2xl gap-10">
      {canUpdate ? (
        <ProjectForm project={project} onChanged={onChanged} />
      ) : (
        <section>
          <h3 className="font-semibold">基本信息</h3>
          <p className="text-muted-foreground mt-1 text-sm">你可以查看此项目，但没有修改项目信息的权限。</p>
        </section>
      )}
      {canDelete ? <DangerZone project={project} /> : null}
    </div>
  );
}

function ProjectForm({ project, onChanged }: { project: ProjectDetailDto["project"]; onChanged: () => void }) {
  const [name, setName] = React.useState(project.name);
  const [description, setDescription] = React.useState(project.description ?? "");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    setName(project.name);
    setDescription(project.description ?? "");
  }, [project]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSaved(false);
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
      setSaved(true);
      onChanged();
    } catch {
      setError("网络异常，请重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section aria-labelledby="project-basics-title">
      <h3 id="project-basics-title" className="font-semibold">
        基本信息
      </h3>
      <p className="text-muted-foreground mt-1 text-sm">修改项目名称与描述。</p>
      <form onSubmit={handleSubmit} className="mt-5 grid gap-4">
        <div className="grid gap-2">
          <Label htmlFor="project-name">名称</Label>
          <Input id="project-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={50} required />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="project-description">描述（可选）</Label>
          <Textarea
            id="project-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={200}
          />
        </div>
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : saved ? (
          <p className="text-success text-sm" role="status">
            项目信息已保存。
          </p>
        ) : null}
        <div>
          <Button type="submit" disabled={submitting}>
            {submitting ? "保存中…" : "保存更改"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function DangerZone({ project }: { project: ProjectDetailDto["project"] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }
      router.push("/projects");
    } catch {
      setError("网络异常，请重试。");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section aria-labelledby="danger-zone-title" className="border-destructive/30 border-t pt-6">
      <h3 id="danger-zone-title" className="text-destructive font-semibold">
        危险操作
      </h3>
      <div className="mt-3 flex flex-col gap-4 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">删除项目</p>
          <p className="text-muted-foreground mt-1 text-sm">永久删除项目及其仓库配置，此操作不可恢复。</p>
        </div>
        <Button variant="destructive" className="sm:shrink-0" onClick={() => setOpen(true)}>
          删除项目
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="删除项目"
        desc={
          <>
            确定删除项目「{project.name}」吗？其仓库配置会一并删除，此操作不可恢复。
            {error ? (
              <span className="text-destructive mt-2 block" role="alert">
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
    </section>
  );
}
