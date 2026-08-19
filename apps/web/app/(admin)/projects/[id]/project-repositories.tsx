"use client";

import { CircleAlert, CircleCheck, FolderGit2, GitBranch, RefreshCw, Star, Trash2 } from "lucide-react";
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
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
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
  if (repos.length === 0) {
    return (
      <Empty className="min-h-80 border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FolderGit2 />
          </EmptyMedia>
          <EmptyTitle>{canManage ? "配置首个仓库" : "尚未配置仓库"}</EmptyTitle>
          <EmptyDescription>
            {canManage
              ? "输入 owner/repo 或 GitHub URL。首个仓库会自动成为主仓库。"
              : "项目负责人尚未完成仓库配置，你当前拥有只读权限。"}
          </EmptyDescription>
        </EmptyHeader>
        {canManage ? (
          <EmptyContent>
            <RepoInput projectId={projectId} onAdded={onChanged} />
          </EmptyContent>
        ) : null}
      </Empty>
    );
  }

  return (
    <section aria-labelledby="repos-title" className="grid gap-5">
      <div className="flex flex-col gap-4 border-b pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h3 id="repos-title" className="font-semibold">
            仓库（{repos.length}）
          </h3>
          <p className="text-muted-foreground mt-1 text-sm">主仓库决定项目是否就绪，其余仓库共同组成 Wiki 工作区。</p>
        </div>
        {canManage ? (
          <div className="w-full lg:max-w-lg">
            <RepoInput projectId={projectId} onAdded={onChanged} compact />
          </div>
        ) : null}
      </div>

      <ul className="grid gap-3">
        {repos.map((repo) => (
          <RepoRow
            key={repo.id}
            projectId={projectId}
            repo={repo}
            repos={repos}
            canManage={canManage}
            onChanged={onChanged}
          />
        ))}
      </ul>
    </section>
  );
}

function RepoInput({
  projectId,
  onAdded,
  compact = false,
}: {
  projectId: string;
  onAdded: () => void;
  compact?: boolean;
}) {
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
    <form onSubmit={handleSubmit} className="grid w-full gap-2">
      <Label htmlFor={compact ? "repo-input-compact" : "repo-input"} className={compact ? "sr-only" : undefined}>
        GitHub 仓库
      </Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id={compact ? "repo-input-compact" : "repo-input"}
          value={repo}
          onChange={(event) => setRepo(event.target.value)}
          placeholder="owner/repo 或 GitHub URL"
          aria-describedby={error ? "repo-input-error" : undefined}
          required
        />
        <Button type="submit" disabled={submitting} className="sm:shrink-0">
          {submitting ? "校验中…" : "添加仓库"}
        </Button>
      </div>
      {error ? (
        <p id="repo-input-error" className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}

function RepoRow({
  projectId,
  repo,
  repos,
  canManage,
  onChanged,
}: {
  projectId: string;
  repo: ProjectRepoDto;
  repos: ProjectRepoDto[];
  canManage: boolean;
  onChanged: () => void;
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
    <li className="rounded-lg border p-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-mono text-sm font-medium">{repo.repo}</span>
            {repo.isPrimary ? (
              <span className="bg-foreground text-background inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-medium">
                <Star className="size-3" />
                主仓库
              </span>
            ) : null}
            <AccessBadge status={repo.accessStatus} />
          </div>
          <div className="text-muted-foreground mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1.5">
              <GitBranch className="size-3.5" />
              默认分支：<span className="text-foreground font-mono">{repo.defaultBranch ?? "—"}</span>
            </span>
            <span>最后校验：{formatDateTime(repo.lastValidatedAt)}</span>
          </div>
        </div>

        {canManage ? (
          <div className="flex flex-wrap gap-2 sm:justify-end">
            {!repo.isPrimary && repo.accessStatus === "available" ? (
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px] sm:min-h-8"
                disabled={busy !== null}
                onClick={() => void runAction("primary")}
              >
                <Star />
                {busy === "primary" ? "切换中…" : "设为主仓"}
              </Button>
            ) : null}
            <Button
              variant="outline"
              size="sm"
              className="min-h-[44px] sm:min-h-8"
              disabled={busy !== null}
              onClick={() => void runAction("revalidate")}
            >
              <RefreshCw className={busy === "revalidate" ? "animate-spin" : undefined} />
              {busy === "revalidate" ? "校验中…" : "重新校验"}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-destructive min-h-[44px] sm:min-h-8"
              onClick={() => setRemoveOpen(true)}
            >
              <Trash2 />
              移除
            </Button>
          </div>
        ) : null}
      </div>
      {error ? (
        <p className="text-destructive mt-3 text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <RemoveRepoDialog
        open={removeOpen}
        onOpenChange={setRemoveOpen}
        projectId={projectId}
        repo={repo}
        repos={repos}
        onRemoved={onChanged}
      />
    </li>
  );
}

function AccessBadge({ status }: { status: ProjectRepoDto["accessStatus"] }) {
  const available = status === "available";
  const Icon = available ? CircleCheck : CircleAlert;
  return (
    <span
      className={
        available
          ? "bg-success/10 text-success inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs"
          : "bg-destructive/10 text-destructive inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs"
      }
    >
      <Icon className="size-3" />
      {available ? "可访问" : "不可访问"}
    </span>
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
