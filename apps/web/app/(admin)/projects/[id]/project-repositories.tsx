"use client";

import { CircleAlert, CircleCheck, FolderGit2, GitBranch, MoreHorizontal, RefreshCw, Star, Trash2 } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { readApiError } from "@/lib/api-error";

import type { ProjectRepoDto } from "./project-types";

export function ProjectRepositories({
  projectId,
  repos,
  canManage,
  onChanged,
}: {
  projectId: string;
  repos: ProjectRepoDto[];
  canManage: boolean;
  onChanged: () => void;
}) {
  const reduceMotion = useReducedMotion();

  return (
    <section aria-labelledby="repos-title" className="grid min-h-full grid-cols-[minmax(0,1fr)_280px]">
      <main className="min-w-0 px-6 py-6">
        <div className="flex items-start justify-between gap-8">
          <div>
            <h2 id="repos-title" className="text-sm font-semibold">
              仓库列表
            </h2>
            <p className="text-muted-foreground mt-1 text-xs">主仓库决定项目是否就绪，其余仓库共同组成 Wiki 工作区。</p>
          </div>
          {!canManage ? <span className="text-muted-foreground text-xs">只读权限</span> : null}
        </div>

        {canManage ? (
          <div className="mt-5 border-y py-3">
            <RepoInput projectId={projectId} onAdded={onChanged} />
          </div>
        ) : null}

        <div className="mt-6">
        {repos.length === 0 ? (
          <motion.div
            initial={false}
            className="flex min-h-64 items-center justify-center border-y"
          >
            <div className="text-center">
              <FolderGit2 className="text-muted-foreground mx-auto size-5" />
              <p className="mt-3 text-sm font-medium">{canManage ? "等待首个仓库" : "尚未配置仓库"}</p>
              <p className="text-muted-foreground mt-1 text-xs">
                {canManage ? "在上方输入仓库地址，首个仓库会自动成为主仓库。" : "项目负责人尚未完成仓库配置。"}
              </p>
            </div>
          </motion.div>
        ) : (
          <div>
            <div className="grid grid-cols-[minmax(200px,1fr)_100px_100px_130px_160px] items-center gap-3 border-y bg-muted/15 px-3 py-2 text-[11px] font-medium text-muted-foreground max-[1360px]:grid-cols-[minmax(180px,1fr)_90px_110px]">
              <span>仓库</span>
              <span className="max-[1360px]:hidden">默认分支</span>
              <span>访问状态</span>
              <span className="max-[1360px]:hidden">最后校验</span>
              <span className="text-right">操作</span>
            </div>
            <ul className="divide-y border-b">
              <AnimatePresence initial={!reduceMotion} mode="popLayout">
                {repos.map((repo) => (
                  <RepoRow
                    key={repo.id}
                    projectId={projectId}
                    repo={repo}
                    repos={repos}
                    canManage={canManage}
                    onChanged={onChanged}
                    reduceMotion={Boolean(reduceMotion)}
                  />
                ))}
              </AnimatePresence>
            </ul>
          </div>
        )}
        </div>
      </main>
      <RepositoryStatusRail repos={repos} />
    </section>
  );
}

function RepoInput({ projectId, onAdded }: { projectId: string; onAdded: () => void }) {
  const [repo, setRepo] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
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
      setRepo("");
      onAdded();
    } catch {
      setError("网络异常，请重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-2 self-center">
      <Label htmlFor="repo-input" className="sr-only">
        GitHub 仓库
      </Label>
      <div className="flex gap-2">
        <Input
          id="repo-input"
          value={repo}
          onChange={(event) => setRepo(event.target.value)}
          placeholder="owner/repo 或 https://github.com/owner/repo"
          aria-describedby={error ? "repo-input-error" : "repo-input-help"}
          className="h-9"
          required
        />
        <Button type="submit" disabled={submitting} className="h-9 shrink-0 px-4">
          {submitting ? "校验中…" : "校验并添加"}
        </Button>
      </div>
      {error ? (
        <p id="repo-input-error" className="text-destructive text-xs" role="alert">
          {error}
        </p>
      ) : (
        <p id="repo-input-help" className="text-muted-foreground text-xs">
          GitHub 404 会保留记录并标记为不可访问；网络或限流不会覆盖旧状态。
        </p>
      )}
    </form>
  );
}

function RepoRow({
  projectId,
  repo,
  repos,
  canManage,
  onChanged,
  reduceMotion,
}: {
  projectId: string;
  repo: ProjectRepoDto;
  repos: ProjectRepoDto[];
  canManage: boolean;
  onChanged: () => void;
  reduceMotion: boolean;
}) {
  const [busy, setBusy] = React.useState<"primary" | "revalidate" | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [removeOpen, setRemoveOpen] = React.useState(false);

  async function runAction(action: "primary" | "revalidate") {
    setBusy(action);
    setError(null);
    try {
      const suffix = action === "primary" ? "primary" : "revalidate";
      const res = await fetch(`/api/projects/${projectId}/repos/${repo.id}/${suffix}`, {
        method: action === "primary" ? "PUT" : "POST",
      });
      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }
      onChanged();
    } catch {
      setError("网络异常，请重试。");
    } finally {
      setBusy(null);
    }
  }

  return (
    <motion.li
      layout
      initial={false}
      animate={{ opacity: 1, x: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, x: 8 }}
      transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
      className="group"
    >
      <div className="grid min-h-[52px] grid-cols-[minmax(200px,1fr)_100px_100px_130px_160px] items-center gap-3 px-3 transition-colors group-hover:bg-accent/35 max-[1360px]:grid-cols-[minmax(180px,1fr)_90px_110px]">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-sm font-medium">{repo.repo}</span>
            {repo.isPrimary ? (
              <span className="bg-foreground text-background inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium">
                <Star className="size-2.5" />
                主仓库
              </span>
            ) : null}
          </div>
          {error ? (
            <p className="text-destructive mt-1.5 text-xs" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <span className="inline-flex min-w-0 items-center gap-1.5 font-mono text-xs max-[1360px]:hidden">
          <GitBranch className="text-muted-foreground size-3.5" />
          <span className="truncate">{repo.defaultBranch ?? "—"}</span>
        </span>
        <AccessBadge status={repo.accessStatus} />
        <span className="text-muted-foreground text-xs tabular-nums max-[1360px]:hidden">{formatDateTime(repo.lastValidatedAt)}</span>
        {canManage ? (
          <div className="flex justify-end gap-1.5">
            {!repo.isPrimary && repo.accessStatus === "available" ? (
              <Button variant="outline" size="sm" disabled={busy !== null} onClick={() => void runAction("primary")}>
                <Star />
                {busy === "primary" ? "切换中" : "设主仓"}
              </Button>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" disabled={busy !== null} aria-label={`管理 ${repo.repo}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void runAction("revalidate")}>
                  <RefreshCw className={busy === "revalidate" ? "animate-spin" : undefined} />
                  重新校验
                </DropdownMenuItem>
                <DropdownMenuItem
                  className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  onSelect={() => setRemoveOpen(true)}
                >
                  <Trash2 />
                  移除仓库
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        ) : (
          <span className="text-muted-foreground text-right text-xs">只读</span>
        )}
      </div>
      <RemoveRepoDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        projectId={projectId}
        repo={repo}
        repos={repos}
        onRemoved={onChanged}
      />
    </motion.li>
  );
}

function AccessBadge({ status }: { status: ProjectRepoDto["accessStatus"] }) {
  const available = status === "available";
  const Icon = available ? CircleCheck : CircleAlert;
  return (
    <span className={available ? "text-success inline-flex items-center gap-1.5 text-xs" : "text-destructive inline-flex items-center gap-1.5 text-xs"}>
      <Icon className="size-3.5" />
      {available ? "可访问" : "不可访问"}
    </span>
  );
}

function RepositoryStatusRail({ repos }: { repos: ProjectRepoDto[] }) {
  const primary = repos.find((repo) => repo.isPrimary) ?? null;
  const available = repos.filter((repo) => repo.accessStatus === "available").length;
  const unavailable = repos.length - available;

  return (
    <aside className="border-l bg-muted/10 p-5" aria-label="仓库状态摘要">
      <div>
        <h2 className="text-sm font-semibold">仓库状态</h2>
        <p className="text-muted-foreground mt-1 text-xs leading-5">主仓库可访问，项目工作区才算就绪。</p>
      </div>
      <dl className="mt-4 divide-y border-t">
        <RepositorySummaryRow label="仓库总数" value={String(repos.length)} />
        <RepositorySummaryRow label="可访问" value={String(available)} tone="ready" />
        <RepositorySummaryRow label="不可访问" value={String(unavailable)} tone={unavailable > 0 ? "attention" : undefined} />
        <RepositorySummaryRow label="主仓库" value={primary?.repo ?? "未配置"} mono />
      </dl>
      <div className="border-t py-4">
        <p className="text-sm font-medium">当前结论</p>
        <p className="text-muted-foreground mt-2 text-xs leading-5">
          {repos.length === 0
            ? "等待配置首个仓库。"
            : primary?.accessStatus === "available"
              ? "主仓库可访问，工作区已就绪。"
              : "主仓库不可访问，需要复检或切换。"}
        </p>
      </div>
    </aside>
  );
}

function RepositorySummaryRow({
  label,
  value,
  tone,
  mono = false,
}: {
  label: string;
  value: string;
  tone?: "ready" | "attention";
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 text-sm">
      <dt className="text-muted-foreground text-xs">{label}</dt>
      <dd
        className={
          tone === "ready"
            ? "text-success font-medium tabular-nums"
            : tone === "attention"
              ? "text-destructive font-medium tabular-nums"
              : mono
                ? "max-w-44 truncate font-mono text-xs"
                : "font-medium tabular-nums"
        }
      >
        {value}
      </dd>
    </div>
  );
}

function RemoveRepoDialog({
  open,
  onOpenChange,
  projectId,
  repo,
  repos,
  onRemoved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  repo: ProjectRepoDto;
  repos: ProjectRepoDto[];
  onRemoved: () => void;
}) {
  const requiresReplacement = repo.isPrimary && repos.length > 1;
  const candidates = repos.filter((candidate) => candidate.id !== repo.id && candidate.accessStatus === "available");
  const [replacementId, setReplacementId] = React.useState("");
  const [removing, setRemoving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setReplacementId("");
      setError(null);
    }
  }, [open]);

  async function handleRemove() {
    setRemoving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/repos/${repo.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ replacementPrimaryRepoId: replacementId || undefined }),
      });
      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }
      onOpenChange(false);
      onRemoved();
    } catch {
      setError("网络异常，请重试。");
    } finally {
      setRemoving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>移除仓库</DialogTitle>
          <DialogDescription>
            确定把 {repo.repo} 从项目中移除吗？GitHub 上的仓库不受影响。
          </DialogDescription>
        </DialogHeader>
        {requiresReplacement ? (
          <div className="grid gap-2 py-2">
            <Label htmlFor="replacement-repo">替代主仓库</Label>
            {candidates.length > 0 ? (
              <Select value={replacementId} onValueChange={setReplacementId}>
                <SelectTrigger id="replacement-repo">
                  <SelectValue placeholder="选择一个可访问仓库" />
                </SelectTrigger>
                <SelectContent>
                  {candidates.map((candidate) => (
                    <SelectItem key={candidate.id} value={candidate.id}>
                      {candidate.repo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <p className="text-destructive text-sm">没有可用的替代仓库，请先重新校验其他仓库。</p>
            )}
          </div>
        ) : null}
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={removing}>
            取消
          </Button>
          <Button
            variant="destructive"
            onClick={() => void handleRemove()}
            disabled={removing || (requiresReplacement && (!replacementId || candidates.length === 0))}
          >
            {removing ? "移除中…" : "移除仓库"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
