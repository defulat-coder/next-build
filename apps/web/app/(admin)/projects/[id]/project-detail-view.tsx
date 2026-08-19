"use client";

import {
  ArrowLeft,
  CircleAlert,
  CircleCheck,
  CircleDashed,
  ClipboardCheck,
  BookOpen,
  Clock3,
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
import { ProjectTasks } from "./project-tasks";
import { ProjectWiki } from "./project-wiki";
import type { ProjectDetailDto, ProjectDetailTab } from "./project-types";

const tabs: { icon: React.ComponentType<{ className?: string }>; label: string; value: ProjectDetailTab }[] = [
  { icon: LayoutDashboard, label: "概览", value: "overview" },
  { icon: ClipboardCheck, label: "任务", value: "tasks" },
  { icon: BookOpen, label: "Wiki", value: "wiki" },
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
              ) : activeTab === "tasks" ? (
                <ProjectTasks
                  projectId={projectId}
                  canCreate={!detail.project.archivedAt && hasProjectPermission(projectId, "task:create")}
                  canAccept={!detail.project.archivedAt && hasProjectPermission(projectId, "task:accept")}
                  repos={detail.repos}
                />
              ) : activeTab === "wiki" ? (
                <ProjectWiki projectId={projectId} canGenerate={!detail.project.archivedAt && hasProjectPermission(projectId, "wiki:generate")} />
              ) : activeTab === "repos" ? (
                <ProjectRepositories
                  projectId={projectId}
                  repos={detail.repos}
                  canManage={!detail.project.archivedAt && hasProjectPermission(projectId, "repo:manage")}
                  onChanged={load}
                />
              ) : (
                <ProjectSettings
                  project={detail.project}
                  canUpdate={!detail.project.archivedAt && hasProjectPermission(projectId, "project:update")}
                  canDelete={!detail.project.archivedAt && hasProjectPermission(projectId, "project:delete")}
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
  const [overview, setOverview] = React.useState<{
    taskSummary: { executing: number; review: number; acceptancePending: number; accepted: number; failed: number };
    knowledge: { published: boolean; stale: boolean };
    members: Array<{ userId: string; name: string; role: string }>;
    eligibility: { task: { ready: boolean; blocker: string | null }; wiki: { ready: boolean; blocker: string | null }; ask: { ready: boolean; blocker: string | null } };
  } | null>(null);
  const [overviewError, setOverviewError] = React.useState(false);
  React.useEffect(() => {
    void (async () => {
      try {
        const response = await fetch(`/api/projects/${detail.project.id}/overview`);
        if (!response.ok) throw new Error("overview failure");
        setOverview(await response.json());
        setOverviewError(false);
      } catch { setOverviewError(true); }
    })();
  }, [detail.project.id]);
  const briefFields = [detail.project.problemStatement, detail.project.desiredOutcome, detail.project.nonGoals, detail.project.targetDate];
  const briefCompleted = briefFields.filter(Boolean).length + (detail.project.successCriteria.length > 0 ? 1 : 0);
  const activeTasks = overview?.taskSummary.executing ?? 0;
  const failedTasks = overview?.taskSummary.failed ?? 0;
  const reviewTasks = overview?.taskSummary.review ?? 0;
  const acceptanceTasks = overview?.taskSummary.acceptancePending ?? 0;
  const acceptedTasks = overview?.taskSummary.accepted ?? 0;
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
      description: "主仓库 metadata 校验可访问；任务、Wiki 与 Ask 仍分别受各自能力门禁约束。",
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
              <Button asChild variant={detail.readiness === "setup_required" ? "default" : "outline"} size="sm" className="mt-4">
                <Link href={`/projects/${detail.project.id}/repos` as Route}>{state.action}</Link>
              </Button>
            </div>
          </div>
        </section>

        <section className="mt-8 max-w-3xl">
          <div className="flex items-end justify-between"><div><h2 className="text-sm font-semibold">项目 Brief</h2><p className="text-muted-foreground mt-1 text-xs">任务与验收共同使用的项目上下文。</p></div><Link href={`/projects/${detail.project.id}/settings` as Route} className="text-muted-foreground hover:text-foreground text-xs underline-offset-4 hover:underline">编辑</Link></div>
          <div className="mt-4 divide-y border-y">
            <BriefRow label="问题" value={detail.project.problemStatement} />
            <BriefRow label="期望结果" value={detail.project.desiredOutcome} />
            <BriefRow label="成功标准" value={detail.project.successCriteria.length ? detail.project.successCriteria.join("；") : null} />
            <BriefRow label="非目标" value={detail.project.nonGoals} />
            <BriefRow label="目标日期" value={detail.project.targetDate ? formatDateTime(detail.project.targetDate) : null} />
          </div>
        </section>

        <section className="mt-8 max-w-3xl">
          <div className="flex items-end justify-between"><div><h2 className="text-sm font-semibold">交付闭环</h2><p className="text-muted-foreground mt-1 text-xs">从 Brief 到任务、评审与知识沉淀的当前状态。</p></div><span className="text-muted-foreground text-xs">Brief {briefCompleted}/5</span></div>
          <div className="mt-4 divide-y border-y">
            <Link href={`/projects/${detail.project.id}/settings` as Route} className="grid grid-cols-[24px_1fr_auto] items-center gap-3 py-3 text-xs outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring"><Settings2 className="text-muted-foreground size-3.5" /><span>完善项目 Brief</span><span className="text-muted-foreground">{briefCompleted === 5 ? "完整" : `缺 ${5 - briefCompleted} 项`}</span></Link>
            <Link href={`/projects/${detail.project.id}/tasks` as Route} className="grid grid-cols-[24px_1fr_auto] items-center gap-3 py-3 text-xs outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring"><ClipboardCheck className="text-muted-foreground size-3.5" /><span>任务与交付</span><span className="text-muted-foreground">{activeTasks} 执行 · {reviewTasks} 待评审 · {acceptanceTasks} 待验收 · {acceptedTasks} 已验收 · {failedTasks} 失败</span></Link>
            <Link href={`/projects/${detail.project.id}/wiki` as Route} className="grid grid-cols-[24px_1fr_auto] items-center gap-3 py-3 text-xs outline-none hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring"><BookOpen className="text-muted-foreground size-3.5" /><span>项目知识</span><span className="text-muted-foreground">{overview?.knowledge.published ? overview.knowledge.stale ? "需要更新" : "已发布" : "未生成"}</span></Link>
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
          <PropertyRow icon={ClipboardCheck} label="活跃任务" value={`${activeTasks}`} />
          <PropertyRow icon={BookOpen} label="Wiki" value={overview?.knowledge.published ? overview.knowledge.stale ? "需更新" : "最新" : "未发布"} />
        </dl>
        <div className="mt-6 border-t pt-4">
          <p className="text-xs font-medium">项目成员</p>
          <div className="mt-3 grid gap-2">{overview?.members.length ? overview.members.map((member) => <div key={member.userId} className="flex items-center justify-between gap-3 text-xs"><span className="truncate">{member.name}</span><span className="text-muted-foreground">{member.role === "project:owner" ? "负责人" : member.role === "project:member" ? "成员" : "只读"}</span></div>) : <p className="text-muted-foreground text-xs">暂无成员信息</p>}</div>
        </div>
        <div className="mt-6 border-t pt-4">
          <p className="text-xs font-medium">能力门禁</p>
          <div className="mt-3 divide-y border-y"><CapabilityRow label="创建任务" ready={!overviewError && Boolean(overview?.eligibility.task.ready)} blocked={overview?.eligibility.task.blocker ?? "状态读取中"} /><CapabilityRow label="生成 Wiki" ready={!overviewError && Boolean(overview?.eligibility.wiki.ready)} blocked={overview?.eligibility.wiki.blocker ?? "状态读取中"} /><CapabilityRow label="Ask AI" ready={!overviewError && Boolean(overview?.eligibility.ask.ready)} blocked={overview?.eligibility.ask.blocker ?? "状态读取中"} /></div>
          {overviewError ? <p className="text-destructive mt-3 text-xs leading-5">交付汇总读取失败，请刷新后再判断项目状态。</p> : null}
        </div>
      </aside>
    </div>
  );
}

function CapabilityRow({ label, ready, blocked }: { label: string; ready: boolean; blocked: string }) {
  return <div className="flex items-center justify-between gap-3 py-2.5 text-xs"><span>{label}</span><span className={ready ? "text-success" : "text-muted-foreground"}>{ready ? "可用" : blocked}</span></div>;
}

function BriefRow({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="grid grid-cols-[120px_minmax(0,1fr)] items-start gap-5 py-3">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className={cn("text-xs leading-5", !value && "text-muted-foreground")}>{value || "尚未填写"}</span>
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
