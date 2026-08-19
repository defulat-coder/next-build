"use client";

import { CircleCheck, CircleDashed, CircleMinus, CircleX, GitPullRequest, Play, Plus, RefreshCw, RotateCcw } from "lucide-react";
import * as React from "react";
import Link from "next/link";
import type { Route } from "next";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { readApiError } from "@/lib/api-error";

import type { ProjectRepoDto, TaskDetailDto } from "./project-types";

interface MemberDto { userId: string; name: string; role: string }
type TaskBlocker = "forbidden" | "repo_missing" | "repo_unavailable" | "reviewer_missing" | null;

const statusCopy: Record<TaskDetailDto["task"]["status"], string> = {
  acceptance_pending: "待业务验收", accepted: "已验收", cancelled: "已取消", closed: "已关闭", draft: "草稿",
  failed: "失败", queued: "排队中", rejected: "验收拒绝", review: "待评审", running: "执行中",
};
const runStageCopy: Record<TaskDetailDto["runs"][number]["stage"], string> = {
  cancelled: "已取消", failed: "执行失败", manual_repair: "需人工修复", provisioning: "准备沙箱",
  publishing: "发布交付", queued: "等待执行", running: "Agent 执行中", succeeded: "执行完成",
};
const deliveryStatusCopy: Record<TaskDetailDto["delivery"]["status"], string> = {
  branch_pushed: "分支已推送", closed_unmerged: "PR 已关闭未合并", draft_pr_open: "Draft PR 待完善",
  merged: "代码已合并", none: "尚未创建交付", ready_for_review: "等待人工评审",
};
const acceptanceStatusCopy = { accepted: "业务验收通过", pending: "等待业务验收", rejected: "业务验收拒绝" } as const;

export function ProjectTasks({ projectId, canCreate, canAccept, repos }: { projectId: string; canCreate: boolean; canAccept: boolean; repos: ProjectRepoDto[] }) {
  const [tasks, setTasks] = React.useState<TaskDetailDto[]>([]);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [composing, setComposing] = React.useState(false);
  const [members, setMembers] = React.useState<MemberDto[]>([]);

  const load = React.useCallback(async () => {
    setError(null);
    try {
      const [response, memberResponse] = await Promise.all([
        fetch(`/api/projects/${projectId}/tasks`),
        fetch(`/api/projects/${projectId}/members`),
      ]);
      if (!response.ok) return setError(await readApiError(response));
      if (!memberResponse.ok) return setError(await readApiError(memberResponse));
      const value = await response.json() as TaskDetailDto[];
      setTasks(value);
      setMembers(await memberResponse.json() as MemberDto[]);
      setSelectedId((current) => current ?? value[0]?.task.id ?? null);
    } catch {
      setError("网络异常，请重试。");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  React.useEffect(() => { void load(); }, [load]);
  const selected = tasks.find((item) => item.task.id === selectedId) ?? null;
  const availableRepos = repos.filter((repo) => repo.accessStatus === "available");
  const blocker: TaskBlocker = !canCreate ? "forbidden" : repos.length === 0 ? "repo_missing" : availableRepos.length === 0 ? "repo_unavailable" : members.length === 0 ? "reviewer_missing" : null;
  const canCreateTask = blocker === null;

  return (
    <div className="grid min-h-full grid-cols-[minmax(0,1fr)_340px]">
      <main className="min-w-0 px-6 py-5">
        <div className="flex items-center justify-between border-b pb-4">
          <div>
            <h2 className="text-sm font-semibold">交付队列</h2>
            <p className="text-muted-foreground mt-1 text-xs">需求、执行尝试与 Pull Request 保持同一条任务身份。</p>
          </div>
          {canCreateTask && tasks.length > 0 ? (
            <Button size="sm" onClick={() => setComposing(true)}><Plus className="size-3.5" />新建任务</Button>
          ) : null}
        </div>

        {error ? <p className="text-destructive py-5 text-sm" role="alert">{error}</p> : null}
        {loading ? <p className="text-muted-foreground py-8 text-sm">正在读取任务…</p> : null}
        {!loading && tasks.length === 0 ? (
          <div className="flex min-h-72 items-center justify-center border-b text-center">
            <div>
              <CircleDashed className="text-muted-foreground mx-auto size-5" />
              <p className="mt-3 text-sm font-medium">还没有交付任务</p>
              <p className="text-muted-foreground mt-1 text-xs">先写清需求与验收标准，再进入执行队列。</p>
            </div>
          </div>
        ) : (
          <div className="divide-y border-b">
            {tasks.map((item) => (
              <button
                key={item.task.id}
                type="button"
                onClick={() => { setSelectedId(item.task.id); setComposing(false); }}
                className={cn(
                  "grid w-full grid-cols-[minmax(0,1fr)_110px_120px] items-center gap-4 px-2 py-3.5 text-left outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring",
                  selectedId === item.task.id && !composing && "bg-muted/60",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{item.task.title}</span>
                  <span className="text-muted-foreground mt-1 block truncate font-mono text-[11px]">{item.task.branch}</span>
                </span>
                <TaskStatus status={item.task.status} />
                <span className="text-muted-foreground truncate text-right text-xs">{formatDate(item.task.updatedAt)}</span>
              </button>
            ))}
          </div>
        )}
      </main>

      <aside className="border-l bg-muted/10 p-5">
        {composing || (!loading && tasks.length === 0 && canCreateTask) ? <TaskComposer members={members} projectId={projectId} repos={availableRepos} onCancel={tasks.length > 0 ? () => setComposing(false) : undefined} onCreated={async () => { setComposing(false); await load(); }} />
          : selected ? <TaskInspector detail={selected} canAccept={canAccept} members={members} onRetried={load} />
            : <EmptyInspector blocker={blocker} projectId={projectId} />}
      </aside>
    </div>
  );
}

function EmptyInspector({ blocker, projectId }: { blocker: TaskBlocker; projectId: string }) {
  const state = blocker ? {
    forbidden: { copy: "你没有创建或驱动任务的权限，请联系项目负责人处理。", action: null },
    repo_missing: { copy: "项目还没有仓库。配置首个仓库并校验通过后才能创建任务。", action: "配置仓库" },
    repo_unavailable: { copy: "项目仓库当前不可访问。请重新校验或选择可访问仓库。", action: "处理仓库" },
    reviewer_missing: { copy: "项目没有可选验收人。请先确认项目成员与负责人。", action: "查看项目成员" },
  }[blocker] : null;
  const href = blocker === "reviewer_missing" ? `/projects/${projectId}` : `/projects/${projectId}/repos`;
  return <div><h2 className="text-sm font-semibold">{state ? "任务创建被阻断" : "验收合同"}</h2><p className="text-muted-foreground mt-2 text-xs leading-5">{state?.copy ?? "每个任务都必须说明需求、可验证的验收标准与验证命令。任务创建后，右侧会持续显示执行尝试、代码交付与业务验收。"}</p>{state?.action ? <Button asChild size="sm" className="mt-4"><Link href={href as Route}>{state.action}</Link></Button> : null}<div className="mt-5 divide-y border-y text-xs"><Row label="需求" value="目标、范围与非目标" /><Row label="验收" value="逐条标准与验收人" /><Row label="验证" value="命令、环境与证据" /><Row label="完成" value="Draft PR → 合并 → 业务验收" /></div></div>;
}

function TaskComposer({ projectId, repos, members, onCancel, onCreated }: { projectId: string; repos: ProjectRepoDto[]; members: MemberDto[]; onCancel?: () => void; onCreated: () => void }) {
  const [title, setTitle] = React.useState("");
  const [requirement, setRequirement] = React.useState("");
  const [acceptance, setAcceptance] = React.useState("");
  const [validation, setValidation] = React.useState("pnpm typecheck\npnpm test");
  const [projectRepoId, setProjectRepoId] = React.useState(repos.find((repo) => repo.isPrimary)?.id ?? repos[0]?.id ?? "");
  const [reviewerId, setReviewerId] = React.useState(members.find((member) => member.role === "project:owner")?.userId ?? members[0]?.userId ?? "");
  const [nonGoals, setNonGoals] = React.useState("");
  const [riskNotes, setRiskNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setSubmitting(true); setError(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/tasks`, {
        body: JSON.stringify({
          acceptanceCriteria: lines(acceptance), idempotencyKey: crypto.randomUUID(), nonGoals, projectRepoId,
          requirement, reviewerId, riskNotes, title, validationCommands: lines(validation),
        }),
        headers: { "Content-Type": "application/json" }, method: "POST",
      });
      if (!response.ok) return setError(await readApiError(response));
      onCreated();
    } catch { setError("网络异常，请重试。"); } finally { setSubmitting(false); }
  }
  return (
    <form onSubmit={submit} className="grid gap-4">
      <div><h2 className="text-sm font-semibold">新建任务</h2><p className="text-muted-foreground mt-1 text-xs leading-5">创建时会重新校验主仓并冻结基线 SHA。</p></div>
      <Field label="标题"><Input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={100} /></Field>
      <Field label="目标仓库"><select value={projectRepoId} onChange={(event) => setProjectRepoId(event.target.value)} className="border-input bg-background h-8 rounded-md border px-2.5 text-sm" required>{repos.map((repo) => <option key={repo.id} value={repo.id}>{repo.repo}{repo.isPrimary ? " · 主仓" : ""}</option>)}</select></Field>
      <Field label="验收人"><select value={reviewerId} onChange={(event) => setReviewerId(event.target.value)} className="border-input bg-background h-8 rounded-md border px-2.5 text-sm" required>{members.map((member) => <option key={member.userId} value={member.userId}>{member.name} · {member.role === "project:owner" ? "负责人" : "成员"}</option>)}</select></Field>
      <Field label="需求"><Textarea value={requirement} onChange={(e) => setRequirement(e.target.value)} required rows={5} className="resize-none" /></Field>
      <Field label="验收标准" hint="每行一条"><Textarea value={acceptance} onChange={(e) => setAcceptance(e.target.value)} required rows={4} className="resize-none" /></Field>
      <Field label="非目标"><Textarea value={nonGoals} onChange={(e) => setNonGoals(e.target.value)} required rows={3} className="resize-none" /></Field>
      <Field label="风险与影响路径"><Textarea value={riskNotes} onChange={(e) => setRiskNotes(e.target.value)} required rows={3} className="resize-none" /></Field>
      <Field label="验证命令" hint="每行一条"><Textarea value={validation} onChange={(e) => setValidation(e.target.value)} required rows={3} className="resize-none font-mono text-xs" /></Field>
      {error ? <p className="text-destructive text-xs" role="alert">{error}</p> : null}
      <div className="flex justify-end gap-2 border-t pt-4">{onCancel ? <Button type="button" variant="ghost" size="sm" onClick={onCancel}>取消</Button> : null}<Button size="sm" disabled={submitting}>{submitting ? "创建中…" : "进入队列"}</Button></div>
    </form>
  );
}

function TaskInspector({ detail, canAccept, members, onRetried }: { detail: TaskDetailDto; canAccept: boolean; members: MemberDto[]; onRetried: () => void }) {
  const [retrying, setRetrying] = React.useState(false); const [error, setError] = React.useState<string | null>(null);
  async function retry() {
    setRetrying(true); setError(null);
    try { const response = await fetch(`/api/projects/${detail.task.projectId}/tasks/${detail.task.id}/retry`, { method: "POST" }); if (!response.ok) return setError(await readApiError(response)); onRetried(); }
    catch { setError("网络异常，请重试。"); } finally { setRetrying(false); }
  }
  async function reconcile() {
    setRetrying(true); setError(null);
    try { const response = await fetch(`/api/projects/${detail.task.projectId}/tasks/${detail.task.id}/reconcile`, { method: "POST" }); if (!response.ok) return setError(await readApiError(response)); onRetried(); }
    catch { setError("网络异常，请重试。"); } finally { setRetrying(false); }
  }
  async function cancel() {
    setRetrying(true); setError(null);
    try { const response = await fetch(`/api/projects/${detail.task.projectId}/tasks/${detail.task.id}/cancel`, { method: "POST" }); if (!response.ok) return setError(await readApiError(response)); onRetried(); }
    catch { setError("网络异常，请重试。"); } finally { setRetrying(false); }
  }
  const lastRun = detail.runs.at(-1);
  const decidedBy = members.find((member) => member.userId === detail.acceptance.decidedBy)?.name ?? detail.acceptance.decidedBy ?? "未记录";
  return (
    <div>
      <div className="flex items-start justify-between gap-3"><h2 className="text-sm font-semibold leading-5">{detail.task.title}</h2><TaskStatus status={detail.task.status} /></div>
      <p className="text-muted-foreground mt-3 text-xs leading-5">{detail.task.requirement}</p>
      <dl className="mt-5 divide-y border-y text-xs">
        <Row label="仓库" value={detail.task.canonicalRepo} mono /><Row label="分支" value={detail.task.branch} mono />
        <Row label="执行" value={lastRun ? `#${lastRun.attempt} · ${runStageCopy[lastRun.stage]}` : "尚未执行"} />
        <Row label="技术验证" value={lastRun?.stage === "succeeded" ? "验证通过" : lastRun?.stage === "failed" ? "验证失败" : "待完成"} />
        <Row label="代码交付" value={deliveryStatusCopy[detail.delivery.status]} />
        <Row label="业务验收" value={acceptanceStatusCopy[detail.acceptance.status]} />
      </dl>
      <div className="mt-5"><p className="text-xs font-medium">验收标准</p><ul className="mt-2 grid gap-2">{detail.task.acceptanceCriteria.map((item) => { const result = detail.acceptance.criteriaResults.find((candidate) => candidate.criterion === item); const CriterionIcon = result ? result.passed ? CircleCheck : CircleX : CircleDashed; return <li key={item} className="flex gap-2 text-xs leading-5"><CriterionIcon className={cn("mt-0.5 size-3.5 shrink-0", result?.passed ? "text-success" : result ? "text-destructive" : "text-muted-foreground")} />{item}</li>; })}</ul></div>
      {detail.delivery.githubPrUrl ? <Button asChild variant="outline" size="sm" className="mt-5 w-full"><a href={detail.delivery.githubPrUrl} target="_blank" rel="noreferrer"><GitPullRequest className="size-3.5" />打开 Pull Request</a></Button> : null}
      {detail.delivery.githubPrNumber ? <Button variant="ghost" size="sm" className="mt-2 w-full" onClick={reconcile} disabled={retrying}><RefreshCw className="size-3.5" />同步 GitHub 状态</Button> : null}
      {(detail.task.status === "queued" || detail.task.status === "running") ? <Button variant="outline" size="sm" className="mt-2 w-full" onClick={cancel} disabled={retrying}>取消任务</Button> : null}
      {(detail.task.status === "acceptance_pending" || detail.task.status === "rejected") && canAccept ? <AcceptanceForm detail={detail} onDecided={onRetried} /> : null}
      {detail.task.status === "accepted" ? <div className="mt-5 border-y py-4 text-xs"><p className="font-medium text-success">业务验收已通过</p><dl className="mt-3 divide-y"><Row label="验收人" value={decidedBy} /><Row label="环境" value={detail.acceptance.environment ?? "未记录"} /><Row label="时间" value={detail.acceptance.decidedAt ? formatDate(detail.acceptance.decidedAt) : "未记录"} /><Row label="备注" value={detail.acceptance.notes || "未提供备注"} /></dl><div className="mt-3"><p className="text-muted-foreground">验收证据</p>{detail.acceptance.evidence.length ? <div className="mt-2 grid gap-1">{detail.acceptance.evidence.map((evidence) => <a key={evidence.url} href={evidence.url} target="_blank" rel="noreferrer" className="underline underline-offset-4">{evidence.label}</a>)}</div> : <p className="mt-1">未提供证据</p>}</div></div> : null}
      {detail.task.status === "failed" ? <Button variant="outline" size="sm" className="mt-2 w-full" onClick={retry} disabled={retrying}><RotateCcw className="size-3.5" />{retrying ? "排队中…" : "重试任务"}</Button> : null}
      {error ? <p className="text-destructive mt-3 text-xs">{error}</p> : null}
    </div>
  );
}

function TaskStatus({ status }: { status: TaskDetailDto["task"]["status"] }) {
  const Icon = status === "failed" || status === "cancelled" || status === "rejected" ? CircleX : status === "accepted" ? CircleCheck : status === "closed" ? CircleMinus : status === "running" ? Play : CircleDashed;
  return <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-full px-2 py-1 text-[11px]", status === "failed" || status === "rejected" ? "bg-destructive/10 text-destructive" : status === "accepted" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground")}><Icon className="size-3" />{statusCopy[status]}</span>;
}

function AcceptanceForm({ detail, onDecided }: { detail: TaskDetailDto; onDecided: () => void }) {
  const [passed, setPassed] = React.useState<Record<string, boolean>>(() => Object.fromEntries(detail.task.acceptanceCriteria.map((criterion) => [criterion, true])));
  const [environment, setEnvironment] = React.useState(detail.acceptance.environment ?? "");
  const [evidenceUrl, setEvidenceUrl] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  async function decide(decision: "accepted" | "rejected") {
    setSubmitting(true); setError(null);
    try {
      const response = await fetch(`/api/projects/${detail.task.projectId}/tasks/${detail.task.id}/acceptance`, {
        body: JSON.stringify({
          criteriaResults: detail.task.acceptanceCriteria.map((criterion) => ({ criterion, passed: passed[criterion] ?? false })),
          decision,
          environment,
          evidence: evidenceUrl ? [{ label: "验收证据", url: evidenceUrl }] : [],
          notes: notes || undefined,
        }),
        headers: { "Content-Type": "application/json" }, method: "POST",
      });
      if (!response.ok) return setError(await readApiError(response));
      onDecided();
    } catch { setError("网络异常，请重试。"); } finally { setSubmitting(false); }
  }
  return <section className="mt-6 border-t pt-5"><h3 className="text-xs font-semibold">业务验收</h3><p className="text-muted-foreground mt-1 text-xs leading-5">代码已合并。请在目标环境逐条确认业务结果。</p><div className="mt-4 grid gap-2">{detail.task.acceptanceCriteria.map((criterion) => <label key={criterion} className="flex items-start gap-2 text-xs"><input type="checkbox" checked={passed[criterion] ?? false} onChange={(event) => setPassed((current) => ({ ...current, [criterion]: event.target.checked }))} className="mt-0.5" /><span>{criterion}</span></label>)}</div><div className="mt-4 grid gap-3"><Field label="目标环境"><Input value={environment} onChange={(event) => setEnvironment(event.target.value)} placeholder="例如 production · https://…" required /></Field><Field label="证据 URL"><Input type="url" value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} placeholder="截图、监控或发布页面" /></Field><Field label="验收备注"><Textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={3} className="resize-none" /></Field></div>{error ? <p className="text-destructive mt-3 text-xs">{error}</p> : null}<div className="mt-4 grid grid-cols-2 gap-2"><Button variant="outline" size="sm" disabled={submitting || !environment} onClick={() => void decide("rejected")}>拒绝</Button><Button size="sm" disabled={submitting || !environment || Object.values(passed).some((value) => !value)} onClick={() => void decide("accepted")}>验收通过</Button></div></section>;
}
function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) { return <div className="grid gap-1.5"><div className="flex justify-between"><Label>{label}</Label>{hint ? <span className="text-muted-foreground text-[11px]">{hint}</span> : null}</div>{children}</div>; }
function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) { return <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-3 py-3"><dt className="text-muted-foreground">{label}</dt><dd className={cn("truncate text-right", mono && "font-mono text-[11px]")}>{value}</dd></div>; }
function lines(value: string) { return value.split("\n").map((item) => item.trim()).filter(Boolean); }
function formatDate(value: string) { return new Intl.DateTimeFormat("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value)); }
