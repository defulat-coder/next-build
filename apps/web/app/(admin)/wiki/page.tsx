export default function WikiPage() {
  return (
    <main id="main-content" className="flex min-h-min flex-1 flex-col p-4 sm:p-6">
      <div className="mb-2">
        <h2 className="text-2xl font-bold tracking-tight">Wiki</h2>
        <p className="text-muted-foreground">以项目为单位，对仓库集整体生成文档（OpenWiki CLI）。</p>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center">
        <p className="font-medium">功能开发中</p>
        <p className="text-muted-foreground text-sm">Wiki 生成与渲染将在后续迭代落地。</p>
      </div>
    </main>
  );
}
