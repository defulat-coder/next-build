"use client";

import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Clock3,
  FolderKanban,
  FolderGit2,
  GitBranch,
  GitFork,
  LayoutDashboard,
  Settings2,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { Route } from "next";
import Link from "next/link";
import * as React from "react";

import { usePermissions } from "@/components/permissions-provider";
import { Button } from "@/components/ui/button";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";
import { readApiError } from "@/lib/api-error";

import { ProjectWorkspaceDesignContract } from "../project-design-contract";
import { ProjectRepositories } from "./project-repositories";
import { ProjectSettings } from "./project-settings";
import type { ProjectDetailDto, ProjectDetailTab } from "./project-types";

const tabs: { icon: React.ComponentType<{ className?: string }>; label: string; value: ProjectDetailTab }[] = [
  { icon: LayoutDashboard, label: "概览", value: "overview" },
  { icon: GitBranch, label: "仓库", value: "repos" },
  { icon: Settings2, label: "设置", value: "settings" },
];

export function ProjectDetailView({ projectId, activeTab }: { projectId: string; activeTab: ProjectDetailTab }) {
  const [detail, setDetail] = React.useState<ProjectDetailDto | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const { hasProjectPermission } = usePermissions();
  const reduceMotion = useReducedMotion();

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
      <div className="flex h-full min-w-[1080px] items-center justify-center">
        <div className="text-center">
          <FolderGit2 className="text-muted-foreground mx-auto size-6" />
          <p className="mt-3 text-sm font-medium">项目不存在</p>
          <p className="text-muted-foreground mt-1 text-xs">它可能已被删除。</p>
          <Button asChild variant="outline" size="sm" className="mt-4">
            <Link href="/projects">返回项目列表</Link>
          </Button>
        </div>
      </div>
    );
  }

  const tabHref = (tab: ProjectDetailTab): Route =>
    (tab === "overview" ? `/projects/${projectId}` : `/projects/${projectId}/${tab}`) as Route;

  return (
    <div className="flex h-full min-w-[1080px] bg-background">
      <ProjectWorkspaceDesignContract />
      <aside className="flex w-[228px] shrink-0 flex-col border-r bg-muted/25" aria-label="项目导航">
        <div className="flex h-12 items-center gap-2 border-b px-3">
          <span className="bg-foreground text-background flex size-5 items-center justify-center rounded text-[10px] font-semibold">
            N
          </span>
          <span className="text-sm font-medium">Next Build</span>
          <SidebarTrigger className="ml-auto size-7" />
        </div>

        <div className="p-2">
          <Link
            href="/projects"
            className="text-muted-foreground hover:text-foreground flex h-8 items-center gap-2 rounded-md px-2 text-xs outline-none hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring"
          >
            <ArrowLeft className="size-3.5" />
            全部项目
          </Link>
        </div>

        <div className="border-y px-3 py-4">
          <div className="flex items-center gap-2.5">
            <span className="bg-chart-3/10 text-chart-3 flex size-7 shrink-0 items-center justify-center rounded-md text-xs font-semibold uppercase">
              {detail?.project.name.slice(0, 1) ?? "…"}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{detail?.project.name ?? "正在加载"}</p>
              {detail ? <ReadinessBadge readiness={detail.readiness} compact /> : null}
            </div>
          </div>
        </div>

        <nav className="p-2">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.value;
            return (
              <Link
                key={tab.value}
                href={tabHref(tab.value)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-8 items-center gap-2 overflow-hidden rounded-md px-2 text-xs outline-none transition-colors hover:bg-accent/70 focus-visible:ring-2 focus-visible:ring-ring",
                  active && "text-accent-foreground",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="linear-project-nav"
                    className="absolute inset-0 bg-accent"
                    transition={{ duration: reduceMotion ? 0 : 0.18, ease: [0.22, 1, 0.36, 1] }}
                  />
                ) : null}
                <Icon className={cn("relative z-10 size-3.5", active ? "text-chart-3" : "text-muted-foreground")} />
                <span className="relative z-10">{tab.label}</span>
              </Link>
            );
          })}
        </nav>

        {detail ? (
          <div className="mt-auto border-t p-3 text-[11px]">
            <div className="flex items-center justify-between py-1.5">
              <span className="text-muted-foreground">仓库</span>
              <span className="tabular-nums">{detail.repos.length}</span>
            </div>
            <div className="flex items-center justify-between gap-3 py-1.5">
              <span className="text-muted-foreground">主仓库</span>
              <span className="max-w-28 truncate font-mono">{detail.primaryRepo?.repo ?? "—"}</span>
            </div>
          </div>
        ) : null}
      </aside>

      <section className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-12 items-center justify-between border-b px-5">
          <div className="text-muted-foreground flex min-w-0 items-center gap-2 text-xs">
            <Link href="/projects" className="hover:text-foreground">
              Projects
            </Link>
            <span>/</span>
            <span className="text-foreground truncate">{detail?.project.name ?? "Loading"}</span>
          </div>
          {detail ? <ReadinessBadge readiness={detail.readiness} /> : null}
        </div>

        <header className="border-b px-6 py-5">
          <h1 className="text-lg font-semibold tracking-[-0.02em]">{tabs.find((tab) => tab.value === activeTab)?.label}</h1>
          <p className="text-muted-foreground mt-1 max-w-3xl truncate text-sm">
            {detail?.project.description || (detail ? "暂无描述" : "正在读取项目工作区…")}
          </p>
        </header>

        <div className="min-h-0 flex-1 overflow-auto">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={activeTab}
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              exit={reduceMotion ? undefined : { opacity: 0, y: -3 }}
              transition={{ duration: reduceMotion ? 0 : 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="min-h-full"
            >
              {loadError ? (
                <div className="px-6 py-5" role="alert">
                  <p className="text-destructive text-sm">{loadError}</p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}>
                    重新加载
                  </Button>
                </div>
              ) : detail === null ? (
                <ProjectDetailSkeleton />
              ) : activeTab === "overview" ? (
                <ProjectOverview detail={detail} />
              ) : activeTab === "repos" ? (
                <ProjectRepositories
                  projectId={projectId}
                  repos={detail.repos}
                  canManage={hasProjectPermission(projectId, "repo:manage")}
                  onChanged={load}
                />
              ) : (
                <ProjectSettings
                  project={detail.project}
                  canUpdate={hasProjectPermission(projectId, "project:update")}
                  canDelete={hasProjectPermission(projectId, "project:delete")}
                  onChanged={load}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </section>
    </div>
  );
}

function ProjectOverview({ detail }: { detail: ProjectDetailDto }) {
  const state = {
    setup_required: {
      icon: CircleDashed,
      title: "工作区还缺少主仓库",
      description: "添加并校验首个 GitHub 仓库后，它会自动成为主仓库。",
      action: "配置首个仓库",
    },
    ready: {
      icon: CircleCheck,
      title: "工作区已就绪",
      description: "主仓库最近一次校验可访问，任务和 Wiki 可以使用这个工作区。",
      action: "查看仓库",
    },
    needs_attention: {
      icon: CircleAlert,
      title: "主仓库需要处理",
      description: "重新校验主仓库，或把另一个可访问仓库切换为主仓库。",
      action: "处理仓库问题",
    },
  }[detail.readiness];
  const Icon = state.icon;

  return (
    <div className="grid min-h-full grid-cols-[minmax(0,1fr)_280px]">
      <main className="px-8 py-7">
        <section className="max-w-3xl">
          <div className="flex items-start gap-4 border-y py-5">
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-md",
                detail.readiness === "ready"
                  ? "bg-success/10 text-success"
                  : detail.readiness === "needs_attention"
                    ? "bg-destructive/10 text-destructive"
                    : "bg-muted text-muted-foreground",
              )}
            >
              <Icon className="size-4" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="text-sm font-semibold">{state.title}</h2>
              <p className="text-muted-foreground mt-1 text-sm leading-6">{state.description}</p>
              <Button asChild variant="outline" size="sm" className="mt-4">
                <Link href={`/projects/${detail.project.id}/repos` as Route}>{state.action}</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="mt-8 max-w-3xl">
          <h2 className="text-sm font-semibold">工作区路径</h2>
          <p className="text-muted-foreground mt-1 text-xs">项目通过主仓库连接到后续任务与 Wiki。</p>
          <div className="mt-4 divide-y border-y">
            <PathRow label="项目" value={detail.project.name} icon={FolderKanban} />
            <PathRow label="主仓库" value={detail.primaryRepo?.repo ?? "未配置"} icon={GitBranch} mono />
            <PathRow
              label="状态"
              value={detail.readiness === "ready" ? "已就绪" : detail.readiness === "needs_attention" ? "需处理" : "待配置"}
              icon={detail.readiness === "ready" ? CircleCheck : detail.readiness === "needs_attention" ? CircleAlert : CircleDashed}
            />
          </div>
        </section>
      </main>

      <aside className="border-l bg-muted/10 p-5" aria-label="项目属性">
        <h2 className="text-xs font-medium">属性</h2>
        <dl className="mt-4 grid gap-4">
          <PropertyRow icon={GitBranch} label="主仓库" value={detail.primaryRepo?.repo ?? "未配置"} mono />
          <PropertyRow icon={GitFork} label="仓库" value={`${detail.repos.length}`} />
          <PropertyRow
            icon={Clock3}
            label="最近校验"
            value={detail.primaryRepo ? formatDateTime(detail.primaryRepo.lastValidatedAt) : "尚未校验"}
          />
        </dl>
        <div className="mt-6 border-t pt-4">
          <p className="text-xs font-medium">待处理事项</p>
          <p className="text-muted-foreground mt-2 text-xs leading-5">
            {detail.readiness === "ready" ? "当前没有阻断项。" : state.description}
          </p>
        </div>
      </aside>
    </div>
  );
}

function PathRow({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[180px_minmax(0,1fr)] items-center px-4 py-3">
      <span className="text-muted-foreground flex items-center gap-2 text-xs">
        <Icon className="size-3.5" />
        {label}
      </span>
      <span className={cn("truncate text-sm", mono && "font-mono text-xs")}>{value}</span>
    </div>
  );
}

function PropertyRow({
  icon: Icon,
  label,
  value,
  mono = false,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-3 text-xs">
      <dt className="text-muted-foreground flex items-center gap-2">
        <Icon className="size-3.5" />
        {label}
      </dt>
      <dd className={cn("truncate", mono && "font-mono text-[11px]")}>{value}</dd>
    </div>
  );
}

function ReadinessBadge({
  readiness,
  compact = false,
}: {
  readiness: ProjectDetailDto["readiness"];
  compact?: boolean;
}) {
  const content = {
    setup_required: { icon: CircleDashed, label: "待配置", className: "text-muted-foreground" },
    ready: { icon: CircleCheck, label: "已就绪", className: "text-success" },
    needs_attention: { icon: CircleAlert, label: "需处理", className: "text-destructive" },
  }[readiness];
  const Icon = content.icon;
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", content.className, compact && "mt-0.5 text-[11px]")}>
      <Icon className="size-3.5" />
      {content.label}
    </span>
  );
}

function ProjectDetailSkeleton() {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_280px]">
      <div className="grid gap-3 px-8 py-7">
        <span className="bg-muted h-28 w-full max-w-3xl animate-pulse rounded-lg" />
        <span className="bg-muted mt-5 h-36 w-full max-w-3xl animate-pulse rounded-lg" />
      </div>
      <div className="border-l bg-muted/10 p-5">
        <span className="bg-muted block h-4 w-28 animate-pulse rounded" />
      </div>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
