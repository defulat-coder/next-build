"use client";

import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  FolderKanban,
  GitFork,
  LayoutList,
  Plus,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as React from "react";

import { usePermissions } from "@/components/permissions-provider";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Textarea } from "@/components/ui/textarea";
import { readApiError } from "@/lib/api-error";
import { cn } from "@/lib/utils";

import { ProjectWorkspaceDesignContract } from "./project-design-contract";

interface ProjectSummaryDto {
  id: string;
  name: string;
  description: string | null;
  repoCount: number;
  readiness: "setup_required" | "ready" | "needs_attention";
  primaryRepo: { repo: string } | null;
  createdAt: string;
}

type ProjectFilter = "all" | ProjectSummaryDto["readiness"];

export function ProjectsView() {
  const [projects, setProjects] = React.useState<ProjectSummaryDto[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<ProjectFilter>("all");
  const { hasPermission } = usePermissions();
  const reduceMotion = useReducedMotion();

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

  const counts = React.useMemo(() => {
    const source = projects ?? [];
    return {
      all: source.length,
      needs_attention: source.filter((project) => project.readiness === "needs_attention").length,
      ready: source.filter((project) => project.readiness === "ready").length,
      setup_required: source.filter((project) => project.readiness === "setup_required").length,
    };
  }, [projects]);

  const visibleProjects = React.useMemo(
    () => (projects ?? []).filter((project) => filter === "all" || project.readiness === filter),
    [filter, projects],
  );

  return (
    <div className="flex h-full min-w-[1080px] bg-background">
      <ProjectWorkspaceDesignContract />
      <aside className="flex w-[228px] shrink-0 flex-col border-r bg-muted/25" aria-label="项目视图">
        <div className="flex h-12 items-center gap-2 border-b px-3">
          <span className="bg-foreground text-background flex size-5 items-center justify-center rounded text-[10px] font-semibold">
            N
          </span>
          <span className="text-sm font-medium">Next Build</span>
          <SidebarTrigger className="ml-auto size-7" />
        </div>

        <nav className="p-2">
          <p className="text-muted-foreground px-2 pb-1 pt-2 text-[11px] font-medium">Workspace</p>
          <ProjectFilterButton
            active={filter === "all"}
            count={counts.all}
            icon={LayoutList}
            label="全部项目"
            onClick={() => setFilter("all")}
          />
          <ProjectFilterButton
            active={filter === "ready"}
            count={counts.ready}
            icon={CircleCheck}
            label="已就绪"
            onClick={() => setFilter("ready")}
          />
          <ProjectFilterButton
            active={filter === "setup_required"}
            count={counts.setup_required}
            icon={CircleDashed}
            label="待配置"
            onClick={() => setFilter("setup_required")}
          />
          <ProjectFilterButton
            active={filter === "needs_attention"}
            count={counts.needs_attention}
            icon={CircleAlert}
            label="需处理"
            onClick={() => setFilter("needs_attention")}
          />
        </nav>

        <div className="mt-auto border-t p-3">
          <p className="text-xs font-medium">项目就绪规则</p>
          <p className="text-muted-foreground mt-1 text-[11px] leading-5">主仓库最近一次校验可访问，工作区才会进入就绪状态。</p>
        </div>
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 items-center justify-between border-b px-5">
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <span>Workspace</span>
            <span>/</span>
            <span className="text-foreground">Projects</span>
          </div>
          <span className="text-muted-foreground text-xs tabular-nums">{visibleProjects.length} projects</span>
        </div>

        <header className="flex items-start justify-between border-b px-6 py-5">
          <div>
            <h1 className="text-lg font-semibold tracking-[-0.02em]">项目</h1>
            <p className="text-muted-foreground mt-1 text-sm">管理仓库工作区、主仓库和访问状态。</p>
          </div>
          {hasPermission("project:create") ? <CreateProjectDialog /> : null}
        </header>

        <div className="min-h-0 flex-1 overflow-auto">
          <div className="grid grid-cols-[minmax(280px,1.4fr)_130px_100px_minmax(180px,0.8fr)_100px] items-center gap-4 border-b bg-muted/15 px-5 py-2 text-[11px] font-medium text-muted-foreground">
            <span>项目</span>
            <span>状态</span>
            <span>仓库</span>
            <span>主仓库</span>
            <span>创建时间</span>
          </div>

          <AnimatePresence mode="popLayout" initial={!reduceMotion}>
            {loadError ? (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="px-5 py-6">
                <p className="text-destructive text-sm" role="alert">
                  {loadError}
                </p>
                <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
                  重新加载
                </Button>
              </motion.div>
            ) : projects === null ? (
              <ProjectRowsSkeleton key="loading" />
            ) : visibleProjects.length === 0 ? (
              <motion.div
                key={`empty-${filter}`}
                initial={false}
                className="flex min-h-64 items-center justify-center"
              >
                <div className="text-center">
                  <FolderKanban className="text-muted-foreground mx-auto size-5" />
                  <p className="mt-3 text-sm font-medium">这个视图里没有项目</p>
                  <p className="text-muted-foreground mt-1 text-xs">切换左侧视图，或创建一个新项目。</p>
                </div>
              </motion.div>
            ) : (
              <motion.div key={`list-${filter}`} layout className="divide-y">
                {visibleProjects.map((project) => (
                  <ProjectRow key={project.id} project={project} reduceMotion={Boolean(reduceMotion)} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
}

function ProjectFilterButton({
  active,
  count,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  count: number;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-8 w-full items-center gap-2 rounded-md px-2 text-xs outline-none transition-colors hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-accent text-accent-foreground",
      )}
    >
      <Icon className={cn("size-3.5", active ? "text-chart-3" : "text-muted-foreground")} />
      <span>{label}</span>
      <span className="text-muted-foreground ml-auto tabular-nums">{count}</span>
    </button>
  );
}

function ProjectRow({ project, reduceMotion }: { project: ProjectSummaryDto; reduceMotion: boolean }) {
  return (
    <motion.div
      layout
      initial={false}
      animate={{ opacity: 1, y: 0 }}
      exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
      transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={`/projects/${project.id}`}
        className="group grid min-h-[58px] grid-cols-[minmax(280px,1.4fr)_130px_100px_minmax(180px,0.8fr)_100px] items-center gap-4 px-5 outline-none transition-colors hover:bg-accent/45 focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
      >
        <div className="flex min-w-0 items-center gap-3">
          <span className="bg-chart-3/10 text-chart-3 flex size-6 shrink-0 items-center justify-center rounded-md text-[11px] font-semibold uppercase">
            {project.name.slice(0, 1)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{project.name}</p>
            <p className="text-muted-foreground mt-0.5 truncate text-xs">{project.description || "暂无描述"}</p>
          </div>
        </div>
        <ReadinessBadge readiness={project.readiness} />
        <span className="inline-flex items-center gap-1.5 text-xs tabular-nums">
          <GitFork className="text-muted-foreground size-3.5" />
          {project.repoCount}
        </span>
        <span className="truncate font-mono text-[11px]">{project.primaryRepo?.repo ?? "—"}</span>
        <span className="text-muted-foreground text-xs tabular-nums">{formatDate(project.createdAt)}</span>
      </Link>
    </motion.div>
  );
}

function ReadinessBadge({ readiness }: { readiness: ProjectSummaryDto["readiness"] }) {
  const content = {
    setup_required: { icon: CircleDashed, label: "待配置", className: "text-muted-foreground" },
    ready: { icon: CircleCheck, label: "已就绪", className: "text-success" },
    needs_attention: { icon: CircleAlert, label: "需处理", className: "text-destructive" },
  }[readiness];
  const Icon = content.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs ${content.className}`}>
      <Icon className="size-3.5" />
      {content.label}
    </span>
  );
}

function ProjectRowsSkeleton() {
  return (
    <div className="divide-y" aria-label="正在加载项目">
      {[0, 1, 2, 3].map((item) => (
        <div
          key={item}
          className="grid min-h-[58px] grid-cols-[minmax(280px,1.4fr)_130px_100px_minmax(180px,0.8fr)_100px] items-center gap-4 px-5"
        >
          <div className="flex items-center gap-3">
            <span className="bg-muted size-6 animate-pulse rounded-md" />
            <div className="grid gap-1.5">
              <span className="bg-muted h-3 w-32 animate-pulse rounded" />
              <span className="bg-muted h-2.5 w-52 animate-pulse rounded" />
            </div>
          </div>
          <span className="bg-muted h-3 w-14 animate-pulse rounded" />
          <span className="bg-muted h-3 w-7 animate-pulse rounded" />
          <span className="bg-muted h-3 w-28 animate-pulse rounded" />
        </div>
      ))}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit" }).format(new Date(value));
}

function CreateProjectDialog() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
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
        <Button size="sm">
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
          <div className="grid gap-4 py-5">
            <div className="grid gap-2">
              <Label htmlFor="project-name">名称</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={50}
                required
                autoFocus
              />
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
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={submitting}>
              取消
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "创建中…" : "创建并配置仓库"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
