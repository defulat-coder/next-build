export default function TasksPage() {
  return (
    <main id="main-content" className="flex min-h-min flex-1 flex-col p-4 sm:p-6">
      <div className="mb-2">
        <h2 className="text-2xl font-bold tracking-tight">任务</h2>
        <p className="text-muted-foreground">
          任务绑定仓库、分支与 Agent 会话，产出以代码分支 + Draft PR 交付。
        </p>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center">
        <p className="font-medium">功能开发中</p>
        <p className="text-muted-foreground text-sm">
          任务创建与列表（GitHub agent/ 前缀 PR 枚举）将在后续迭代落地。
        </p>
      </div>
    </main>
  );
}
