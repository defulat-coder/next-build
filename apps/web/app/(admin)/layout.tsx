import { cookies } from "next/headers";

import { AppSidebar } from "@/components/layout/app-sidebar";
import { Separator } from "@/components/ui/separator";
import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { site } from "@/data/site";
import { cn } from "@/lib/utils";

interface Props {
  children: React.ReactNode;
}

export default async function DashboardLayout({ children }: Props) {
  const cookieStore = await cookies();
  /** Matches client `sidebar.tsx`: cookie is `"true"` / `"false"`; treat missing as open. */
  const sidebarDefaultOpen =
    cookieStore.get("sidebar_state")?.value !== "false";

  return (
    <SidebarProvider defaultOpen={sidebarDefaultOpen}>
      <AppSidebar />
      <SidebarInset>
        {/* 移动端窄屏顶栏（桌面无顶栏，开关在侧边栏头部） */}
        <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4 md:hidden">
          <SidebarTrigger className="-ml-1" />
          <Separator
            orientation="vertical"
            className="mr-2 data-[orientation=vertical]:h-4"
          />
          <span className="font-semibold">{site.title}</span>
        </header>
        <div
          id="content"
          className={cn(
            "flex h-full w-full min-w-0 flex-1 flex-col",
            "has-[div[data-layout=fixed]]:h-svh",
            "group-data-[scroll-locked=1]/body:h-full",
            "has-[data-layout=fixed]:group-data-[scroll-locked=1]/body:h-svh",
          )}
        >
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
