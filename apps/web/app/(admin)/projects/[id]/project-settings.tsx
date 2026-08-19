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

import type { ProjectDetailDto, TaskDetailDto } from "./project-types";

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
          <>
            <ProjectForm project={project} onChanged={onChanged} />
            <ProjectCompletion project={project} onChanged={onChanged} />
          </>
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
  const [problemStatement, setProblemStatement] = React.useState(project.problemStatement ?? "");
  const [desiredOutcome, setDesiredOutcome] = React.useState(project.desiredOutcome ?? "");
  const [successCriteria, setSuccessCriteria] = React.useState(project.successCriteria.join("\n"));
  const [nonGoals, setNonGoals] = React.useState(project.nonGoals ?? "");
  const [targetDate, setTargetDate] = React.useState(project.targetDate?.slice(0, 10) ?? "");
  const [lifecycleStatus, setLifecycleStatus] = React.useState(project.lifecycleStatus);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const reduceMotion = useReducedMotion();

  React.useEffect(() => {
    setName(project.name);
    setDescription(project.description ?? "");
    setProblemStatement(project.problemStatement ?? "");
    setDesiredOutcome(project.desiredOutcome ?? "");
    setSuccessCriteria(project.successCriteria.join("\n"));
    setNonGoals(project.nonGoals ?? "");
    setTargetDate(project.targetDate?.slice(0, 10) ?? "");
    setLifecycleStatus(project.lifecycleStatus);
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
        body: JSON.stringify({
          name,
          description: description || undefined,
          desiredOutcome: desiredOutcome || undefined,
          lifecycleStatus,
          nonGoals: nonGoals || undefined,
          problemStatement: problemStatement || undefined,
          successCriteria: successCriteria.split("\n").map((item) => item.trim()).filter(Boolean),
          targetDate: targetDate ? new Date(`${targetDate}T12:00:00`).toISOString() : null,
        }),
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

  const dirty = name !== project.name || description !== (project.description ?? "") ||
    problemStatement !== (project.problemStatement ?? "") || desiredOutcome !== (project.desiredOutcome ?? "") ||
    successCriteria !== project.successCriteria.join("\n") || nonGoals !== (project.nonGoals ?? "") ||
    targetDate !== (project.targetDate?.slice(0, 10) ?? "") || lifecycleStatus !== project.lifecycleStatus;

  return (
    <section aria-labelledby="project-basics-title" className="max-w-3xl">
      <div className="flex items-start justify-between gap-8">
        <div>
          <h2 id="project-basics-title" className="text-sm font-semibold">
            基本信息
          </h2>
          <p className="text-muted-foreground mt-1 text-xs">Brief 是任务验收与交付判断的上游上下文。</p>
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

        <SettingField label="问题陈述" hint="为什么现在要做">
          <Textarea value={problemStatement} onChange={(event) => setProblemStatement(event.target.value)} rows={3} maxLength={1000} className="resize-none" />
        </SettingField>
        <SettingField label="期望结果" hint="交付后发生什么变化">
          <Textarea value={desiredOutcome} onChange={(event) => setDesiredOutcome(event.target.value)} rows={3} maxLength={1000} className="resize-none" />
        </SettingField>
        <SettingField label="成功标准" hint="每行一条，可验证">
          <Textarea value={successCriteria} onChange={(event) => setSuccessCriteria(event.target.value)} rows={4} className="resize-none" />
        </SettingField>
        <SettingField label="非目标" hint="明确本期不做什么">
          <Textarea value={nonGoals} onChange={(event) => setNonGoals(event.target.value)} rows={3} maxLength={1000} className="resize-none" />
        </SettingField>
        <SettingField label="计划" hint="生命周期与目标日期">
          <div className="grid grid-cols-2 gap-3">
            <select aria-label="项目生命周期" value={lifecycleStatus} onChange={(event) => setLifecycleStatus(event.target.value as typeof lifecycleStatus)} className="border-input bg-background focus-visible:ring-ring h-9 rounded-md border px-3 text-sm outline-none focus-visible:ring-2">
              <option value="planned">计划中</option><option value="active">进行中</option><option value="blocked">受阻</option>{project.lifecycleStatus === "completed" ? <option value="completed" disabled>已完成</option> : null}
            </select>
            <Input type="date" aria-label="目标日期" value={targetDate} onChange={(event) => setTargetDate(event.target.value)} />
          </div>
        </SettingField>
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

function ProjectCompletion({ project, onChanged }: { project: ProjectDetailDto["project"]; onChanged: () => void }) {
  const [tasks, setTasks] = React.useState<TaskDetailDto[] | null>(null);
  const [criteria, setCriteria] = React.useState<Record<string, boolean>>(() => Object.fromEntries(project.successCriteria.map((item) => [item, false])));
  const [summary, setSummary] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  React.useEffect(() => {
    void fetch(`/api/projects/${project.id}/tasks`).then(async (response) => {
      if (!response.ok) throw new Error(await readApiError(response));
      setTasks(await response.json() as TaskDetailDto[]);
    }).catch((cause: unknown) => setError(cause instanceof Error ? cause.message : "交付状态读取失败"));
  }, [project.id]);
  if (project.lifecycleStatus === "completed") {
    return <section className="mt-10 max-w-3xl border-y py-5"><h2 className="text-sm font-semibold">项目已完成</h2><p className="text-muted-foreground mt-1 text-xs">{project.completedAt ? formatDateTime(project.completedAt) : ""}</p><p className="mt-4 text-sm leading-6">{project.completionSummary}</p><div className="mt-4 divide-y border-y">{project.completionCriteriaResults.map((result) => <div key={result.criterion} className="flex justify-between gap-4 py-3 text-xs"><span>{result.criterion}</span><span className="text-success">已满足</span></div>)}</div></section>;
  }
  const accepted = tasks?.filter((detail) => detail.task.status === "accepted").length ?? 0;
  const blocking = tasks?.filter((detail) => !["accepted", "cancelled"].includes(detail.task.status)).length ?? 0;
  const tasksReady = tasks !== null && accepted > 0 && blocking === 0;
  const criteriaReady = project.successCriteria.length > 0 && project.successCriteria.every((criterion) => criteria[criterion]);
  const ready = tasksReady && criteriaReady && summary.trim().length > 0;
  async function complete() {
    setSubmitting(true); setError(null);
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        body: JSON.stringify({
          completionCriteriaResults: project.successCriteria.map((criterion) => ({ criterion, passed: criteria[criterion] ?? false })),
          completionSummary: summary, lifecycleStatus: "completed", name: project.name,
        }),
        headers: { "Content-Type": "application/json" }, method: "PATCH",
      });
      if (!response.ok) return setError(await readApiError(response));
      onChanged();
    } catch { setError("网络异常，请重试。"); } finally { setSubmitting(false); }
  }
  return <section className="mt-10 max-w-3xl border-y py-5"><h2 className="text-sm font-semibold">完成项目</h2><p className="text-muted-foreground mt-1 text-xs">完成是业务结论，不等同于代码合并。此处只使用已保存的 Brief 与任务状态。</p><div className="mt-5 divide-y border-y text-xs"><CompletionGate label="任务业务验收" ready={tasksReady} value={tasks === null ? "读取中" : blocking ? `${blocking} 个未验收` : accepted ? `${accepted} 个已验收` : "至少需要 1 个已验收任务"} /><CompletionGate label="项目成功标准" ready={criteriaReady} value={project.successCriteria.length ? `${Object.values(criteria).filter(Boolean).length}/${project.successCriteria.length}` : "先保存成功标准"} /><CompletionGate label="完成总结" ready={summary.trim().length > 0} value={summary.trim() ? "已填写" : "待填写"} /></div>{project.successCriteria.length ? <div className="mt-5 grid gap-2">{project.successCriteria.map((criterion) => <label key={criterion} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={criteria[criterion] ?? false} onChange={(event) => setCriteria((current) => ({ ...current, [criterion]: event.target.checked }))} />{criterion}</label>)}</div> : null}<Textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={4} className="mt-4 resize-none" placeholder="实际结果、遗留项、上线证据与后续动作" />{error ? <p className="text-destructive mt-3 text-xs">{error}</p> : null}<div className="mt-4 flex justify-end"><Button onClick={() => void complete()} disabled={!ready || submitting}>{submitting ? "完成中…" : "完成项目"}</Button></div></section>;
}

function CompletionGate({ label, ready, value }: { label: string; ready: boolean; value: string }) {
  return <div className="flex items-center justify-between gap-4 py-3"><span>{label}</span><span className={ready ? "text-success" : "text-muted-foreground"}>{value}</span></div>;
}

function SettingField({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return <div className="grid grid-cols-[160px_minmax(0,1fr)] items-start gap-6 border-t pt-6"><div><Label>{label}</Label><p className="text-muted-foreground mt-1 text-xs">{hint}</p></div>{children}</div>;
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
      <p className="text-muted-foreground mt-2 text-sm leading-6">归档后项目保持可追溯，但不再接受新任务或知识生成。</p>
      <Button variant="destructive" size="sm" className="mt-4" onClick={() => setOpen(true)}>
        归档项目
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="归档项目"
        desc={
          <>
            确定归档项目「{project.name}」吗？历史任务、交付与知识版本会保留。
            {error ? (
              <span className="text-destructive mt-2 block" role="alert">
                {error}
              </span>
            ) : null}
          </>
        }
        cancelBtnText="取消"
        confirmText="归档"
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
