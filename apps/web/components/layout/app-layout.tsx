import { CommandMenu } from "@/components/layout/command-menu";
import { FloatingSidebar } from "@/components/layout/floating-sidebar";
import { Header } from "@/components/layout/header";

/** 页面骨架：悬浮侧边栏（不占流）+ 顶栏 + 内容区（左侧给悬浮栏留 72px）。
    内容区用 background-secondary 灰底，卡片浮其上形成二级分层。 */
export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-screen overflow-hidden bg-background">
      <FloatingSidebar />
      <CommandMenu />
      <div className="flex h-full flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto bg-background-secondary p-6 pl-[72px]">{children}</main>
      </div>
    </div>
  );
}
