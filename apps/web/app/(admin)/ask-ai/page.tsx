import { PageHeader } from "@/components/layout/page-header";

export default function AskAiPage() {
  return (
    <main id="main-content" className="flex min-h-min flex-1 flex-col p-4 sm:p-6">
      <PageHeader
        title="Ask AI"
        description="基于库中的 Wiki 文档和源文件做问答（FTS5 检索 + Claude）。"
      />
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center">
        <p className="font-medium">功能开发中</p>
        <p className="text-muted-foreground text-sm">问答能力将在 Wiki 入库之后落地。</p>
      </div>
    </main>
  );
}
