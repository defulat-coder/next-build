"use client";

import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  Clock3,
  FolderGit2,
  GitBranch,
  GitFork,
} from "lucide-react";
import type { Route } from "next";
import Link from "next/link";
import * as React from "react";

import { PageHeader } from "@/components/layout/page-header";
import { usePermissions } from "@/components/permissions-provider";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { readApiError } from "@/lib/api-error";

import { ProjectRepositories } from "./project-repositories";
import { ProjectSettings } from "./project-settings";
import type { ProjectDetailDto, ProjectDetailTab } from "./project-types";

const tabs: { label: string; value: ProjectDetailTab }[] = [
  { label: "概览", value: "overview" },
  { label: "仓库", value: "repos" },
  { label: "设置", value: "settings" },
];

export function ProjectDetailView({ projectId, activeTab }: { projectId: string; activeTab: ProjectDetailTab }) {
  const [detail, setDetail] = React.useState<ProjectDetailDto | null>(null);
  const [notFound, setNotFound] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const { hasProjectPermission } = usePermissions();

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

  const tabHref = (tab: ProjectDetailTab): Route =>
    (tab === "overview" ? `/projects/${projectId}` : `/projects/${projectId}/${tab}`) as Route;

  return (
    <>
      <PageHeader title={detail?.project.name ?? "项目详情"} description={detail?.project.description ?? undefined} />

      <nav aria-label="项目详情" className="mb-6 flex border-b">
        {tabs.map((tab) => (
          <Link
            key={tab.value}
            href={tabHref(tab.value)}
            aria-current={activeTab === tab.value ? "page" : undefined}
            className={cn(
              "text-muted-foreground hover:text-foreground relative px-4 py-2.5 text-sm font-medium transition-colors",
              activeTab === tab.value &&
                "text-foreground after:bg-foreground after:absolute after:inset-x-3 after:-bottom-px after:h-0.5",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {loadError ? (
        <div className="border-destructive/30 bg-destructive/5 text-destructive rounded-lg border px-4 py-3 text-sm" role="alert">
          {loadError}
        </div>
      ) : null}

      {detail === null && !loadError ? (
        <p className="text-muted-foreground text-sm">加载中…</p>
      ) : detail ? (
        activeTab === "overview" ? (
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
        )
      ) : null}
    </>
  );
}

function ProjectOverview({ detail }: { detail: ProjectDetailDto }) {
  const state = {
    setup_required: {
      icon: CircleDashed,
      label: "待配置",
      description: "添加并校验首个 GitHub 仓库后，项目工作区才可使用。",
      className: "bg-muted text-muted-foreground",
      action: "添加并校验首个仓库",
    },
    ready: {
      icon: CircleCheck,
      label: "已就绪",
      description: "主仓库最近一次校验可访问，项目工作区可以使用。",
      className: "bg-success/10 text-success",
      action: "暂无待处理事项",
    },
    needs_attention: {
      icon: CircleAlert,
      label: "需处理",
      description: "主仓库不可访问，后续任务和 Wiki 操作将被阻断。",
      className: "bg-destructive/10 text-destructive",
      action: "重新校验主仓库，或切换到另一个可访问仓库",
    },
  }[detail.readiness];
  const Icon = state.icon;

  return (
    <div className="grid max-w-3xl gap-8">
      <section aria-labelledby="workspace-status-title" className="flex items-start gap-4 border-b pb-6">
        <span className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${state.className}`}>
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 id="workspace-status-title" className="font-semibold">
            项目{state.label}
          </h3>
          <p className="text-muted-foreground mt-1 text-sm leading-6">{state.description}</p>
        </div>
      </section>

      <section aria-labelledby="workspace-detail-title">
        <h3 id="workspace-detail-title" className="mb-3 text-sm font-semibold">
          工作区信息
        </h3>
        <dl className="divide-y rounded-lg border">
          <OverviewRow icon={GitBranch} label="主仓库" value={detail.primaryRepo?.repo ?? "未配置"} mono />
          <OverviewRow icon={GitFork} label="仓库数量" value={`${detail.repos.length} 个`} />
          <OverviewRow
            icon={Clock3}
            label="最近校验"
            value={detail.primaryRepo ? formatDateTime(detail.primaryRepo.lastValidatedAt) : "尚未校验"}
          />
        </dl>
      </section>

      <section aria-labelledby="project-todos-title">
        <h3 id="project-todos-title" className="mb-3 text-sm font-semibold">
          待处理事项
        </h3>
        <p className="bg-muted/50 rounded-lg border px-4 py-3 text-sm">{state.action}</p>
      </section>
    </div>
  );
}

function OverviewRow({
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
    <div className="grid gap-1 px-4 py-3 sm:grid-cols-[10rem_1fr] sm:items-center">
      <dt className="text-muted-foreground flex items-center gap-2 text-sm">
        <Icon className="size-4" />
        {label}
      </dt>
      <dd className={cn("min-w-0 truncate text-sm", mono && "font-mono")}>{value}</dd>
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
