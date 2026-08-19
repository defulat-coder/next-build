"use client";

import { BookOpen, CircleAlert, CircleCheck, CircleDashed, RefreshCw } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { readApiError } from "@/lib/api-error";

import type { KnowledgeStatusDto } from "./project-types";

export function ProjectWiki({ projectId, canGenerate }: { projectId: string; canGenerate: boolean }) {
  const [status, setStatus] = React.useState<KnowledgeStatusDto | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [generating, setGenerating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const load = React.useCallback(async () => {
    try { const response = await fetch(`/api/projects/${projectId}/knowledge`); if (!response.ok) return setError(await readApiError(response)); setStatus(await response.json()); }
    catch { setError("网络异常，请重试。"); } finally { setLoading(false); }
  }, [projectId]);
  React.useEffect(() => { void load(); }, [load]);
  async function generate() {
    setGenerating(true); setError(null);
    try { const response = await fetch(`/api/projects/${projectId}/knowledge/generations`, { method: "POST" }); if (!response.ok) return setError(await readApiError(response)); await load(); }
    catch { setError("网络异常，请重试。"); } finally { setGenerating(false); }
  }
  const published = status?.publishedGeneration;
  return (
    <div className="grid min-h-full grid-cols-[minmax(0,1fr)_300px]">
      <main className="px-8 py-7">
        <div className="flex items-center justify-between border-b pb-5">
          <div><h2 className="text-sm font-semibold">项目知识</h2><p className="text-muted-foreground mt-1 text-xs">Wiki 与源码索引始终绑定一个完整、可追溯的仓库 SHA 集。</p></div>
          {canGenerate ? <Button size="sm" variant={published ? "outline" : "default"} onClick={generate} disabled={generating}><RefreshCw className="size-3.5" />{generating ? "校验源码中…" : published ? "生成新版本" : "生成首个版本"}</Button> : null}
        </div>
        {error ? <p className="text-destructive py-5 text-sm" role="alert">{error}</p> : null}
        {loading ? <p className="text-muted-foreground py-8 text-sm">正在读取知识版本…</p> : published ? (
          <section className="py-6"><div className="flex items-start gap-3"><CircleCheck className="text-success mt-0.5 size-4" /><div><h3 className="text-sm font-medium">已发布知识版本</h3><p className="text-muted-foreground mt-1 text-xs">发布时间 {formatDate(published.publishedAt!)} · {published.sourceSet.length} 个仓库 · {status?.documents.length ?? 0} 篇文档</p></div></div><SourceSet sources={published.sourceSet} />{status?.documents.length ? <div className="mt-6"><h3 className="text-xs font-medium">Wiki 文档</h3><div className="mt-3 divide-y border-y">{status.documents.map((document) => <div key={document.id} className="grid grid-cols-[1fr_160px] gap-4 py-3 text-xs"><span className="truncate">{document.title}</span><span className="text-muted-foreground truncate text-right font-mono">{document.repo}/{document.path}</span></div>)}</div></div> : null}</section>
        ) : (
          <div className="flex min-h-72 items-center justify-center border-b text-center"><div><BookOpen className="text-muted-foreground mx-auto size-5" /><p className="mt-3 text-sm font-medium">还没有可读取的 Wiki</p><p className="text-muted-foreground mt-1 text-xs">首个 generation 完整发布后，Wiki 与 Ask 才会开放。</p></div></div>
        )}
        {status?.generations.length ? <section className="mt-7"><h3 className="text-xs font-medium">生成记录</h3><div className="mt-3 divide-y border-y">{status.generations.map((generation) => <div key={generation.id} className="grid grid-cols-[1fr_100px_140px] items-center gap-4 py-3 text-xs"><span className="truncate font-mono">{generation.id.slice(0, 8)}</span><GenerationStatus status={generation.status} /><span className="text-muted-foreground text-right">{formatDate(generation.createdAt)}</span></div>)}</div></section> : null}
      </main>
      <aside className="border-l bg-muted/10 p-5"><h2 className="text-xs font-medium">读取契约</h2><dl className="mt-4 divide-y border-y text-xs"><Info label="当前版本" value={published?.id.slice(0, 8) ?? "未发布"} /><Info label="截至" value={status?.asOf ? formatDate(status.asOf) : "—"} /><Info label="新鲜度" value={status?.stale ? "需要更新" : published ? "最新" : "不可用"} /></dl><div className="mt-5 flex gap-2 text-xs leading-5 text-muted-foreground">{status?.stale ? <CircleAlert className="mt-0.5 size-3.5 shrink-0" /> : <CircleCheck className="mt-0.5 size-3.5 shrink-0" />}Ask 的回答会固定引用已发布版本，不读取排队中或失败的 generation。</div></aside>
    </div>
  );
}

function SourceSet({ sources }: { sources: Array<{ repo: string; sha: string }> }) { return <div className="mt-5 divide-y border-y">{sources.map((source) => <div key={source.repo} className="grid grid-cols-[1fr_150px] gap-4 py-3 text-xs"><span>{source.repo}</span><span className="text-muted-foreground truncate text-right font-mono">{source.sha.slice(0, 12)}</span></div>)}</div>; }
function GenerationStatus({ status }: { status: KnowledgeStatusDto["generations"][number]["status"] }) { const Icon = status === "published" ? CircleCheck : status === "failed" ? CircleAlert : CircleDashed; const copy = { failed: "失败", generating: "生成中", published: "已发布", queued: "排队中" }[status]; return <span className="text-muted-foreground inline-flex items-center gap-1.5"><Icon className="size-3" />{copy}</span>; }
function Info({ label, value }: { label: string; value: string }) { return <div className="flex justify-between gap-3 py-3"><dt className="text-muted-foreground">{label}</dt><dd>{value}</dd></div>; }
function formatDate(value: string) { return new Intl.DateTimeFormat("zh-CN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)); }
