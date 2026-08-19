"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
    <div className="grid min-h-full grid-cols-[minmax(0,1fr)_280px]">
      <main className="px-8 py-7">
        {canUpdate ? (
          <ProjectForm project={project} onChanged={onChanged} />
        ) : (
          <section>
            <h2 className="text-sm font-semibold">基本信息</h2>
            <p className="text-muted-foreground mt-2 text-xs">你可以查看此项目，但没有修改项目信息的权限。</p>
          </section>
        )}
      </main>

      <aside className="border-l bg-muted/10 p-5" aria-label="项目记录与危险操作">
        <div>
          <h2 className="text-sm font-semibold">项目记录</h2>
          <dl className="mt-4 divide-y border-t">
            <RecordRow label="项目 ID" value={project.id} mono />
            <RecordRow label="创建时间" value={formatDateTime(project.createdAt)} />
            <RecordRow label="更新时间" value={formatDateTime(project.updatedAt)} />
          </dl>
        </div>
        {canDelete ? <DangerZone project={project} /> : null}
      </aside>
    </div>
  );
}

function ProjectForm({ project, onChanged }: { project: ProjectDetailDto["project"]; onChanged: () => void }) {
  const [name, setName] = React.useState(project.name);
  const [description, setDescription] = React.useState(project.description ?? "");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const reduceMotion = useReducedMotion();

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

  const dirty = name !== project.name || description !== (project.description ?? "");

  return (
    <section aria-labelledby="project-basics-title" className="max-w-3xl">
      <div className="flex items-start justify-between gap-8">
        <div>
          <h2 id="project-basics-title" className="text-sm font-semibold">
            基本信息
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">名称用于识别工作区，描述用于说明项目边界。</p>
        </div>
        <span className="text-muted-foreground text-xs">最多 50 / 200 字</span>
      </div>

      <form onSubmit={handleSubmit} className="mt-6 grid gap-5 border-y py-5">
        <div className="grid grid-cols-[160px_minmax(0,1fr)] items-start gap-6">
          <div>
            <Label htmlFor="project-name">名称</Label>
            <p className="text-muted-foreground mt-1 text-xs">显示在项目列表与工作区标题中。</p>
          </div>
          <Input
            id="project-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={50}
            className="h-9"
            required
          />
        </div>
        <div className="grid grid-cols-[160px_minmax(0,1fr)] items-start gap-6 border-t pt-6">
          <div>
            <Label htmlFor="project-description">描述</Label>
            <p className="text-muted-foreground mt-1 text-xs">说明项目服务的产品、团队或代码边界。</p>
          </div>
          <Textarea
            id="project-description"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={200}
            rows={4}
            className="resize-none"
          />
        </div>

        <div className="flex min-h-8 items-center justify-between border-t pt-5">
          <AnimatePresence mode="wait" initial={false}>
            {error ? (
              <motion.p
                key="error"
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="text-destructive text-sm"
                role="alert"
              >
                {error}
              </motion.p>
            ) : saved ? (
              <motion.p
                key="saved"
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
                className="text-success text-sm"
                role="status"
              >
                项目信息已保存。
              </motion.p>
            ) : (
              <span key="hint" className="text-muted-foreground text-xs">
                {dirty ? "有未保存的更改" : "当前信息已同步"}
              </span>
            )}
          </AnimatePresence>
          <Button type="submit" disabled={submitting || !dirty}>
            {submitting ? "保存中…" : "保存更改"}
          </Button>
        </div>
      </form>
    </section>
  );
}

function RecordRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="grid gap-1 py-3">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd className={mono ? "truncate font-mono text-xs" : "text-sm tabular-nums"}>{value}</dd>
    </div>
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
    <section aria-labelledby="danger-zone-title" className="border-destructive/30 border-t py-5">
      <h2 id="danger-zone-title" className="text-destructive text-sm font-semibold">
        危险操作
      </h2>
      <p className="text-muted-foreground mt-2 text-sm leading-6">永久删除项目及其仓库配置，GitHub 仓库不受影响。</p>
      <Button variant="destructive" size="sm" className="mt-4" onClick={() => setOpen(true)}>
        删除项目
      </Button>
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
