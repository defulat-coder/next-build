"use client";

import { Search } from "lucide-react";
import * as React from "react";

import { NavGroup } from "@/components/layout/nav-group";
import { NavUser } from "@/components/layout/nav-user";
import { Logo } from "@/components/logo";
import { usePermissions } from "@/components/permissions-provider";
import { useSearch } from "@/components/search-provider";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { getVisibleNavGroups } from "@/data/sidebar-data";
import { site } from "@/data/site";
import { cn } from "@/lib/utils";

/** 品牌区（参考 @shadcnblocks/application-shell2 的 SidebarLogo）：图标 + 名称，无下拉切换。 */
function SidebarLogo() {
  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <SidebarMenuButton size="lg" tooltip={site.title}>
          <div className="border-muted-foreground/25 flex aspect-square size-8 items-center justify-center rounded-lg border bg-transparent">
            <Logo className="size-4" />
          </div>
          <div className="grid flex-1 gap-0.5 text-left leading-none">
            <span className="truncate font-medium">{site.title}</span>
            <span className="text-muted-foreground truncate text-xs">
              {site.plan}
            </span>
          </div>
        </SidebarMenuButton>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const [isMounted, setIsMounted] = React.useState(false);
  const { state } = useSidebar();
  const { setOpen: setCommandOpen } = useSearch();
  const { hasPermission } = usePermissions();
  const navGroups = getVisibleNavGroups(hasPermission);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  if (!isMounted) {
    return (
      <div
        aria-hidden="true"
        className={cn(
          "hidden h-svh shrink-0 bg-transparent md:block",
          state === "collapsed"
            ? "w-(--sidebar-width-icon)"
            : "w-(--sidebar-width)",
        )}
      />
    );
  }

  return (
    <Sidebar variant="inset" collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarLogo />
      </SidebarHeader>
      <SidebarContent className="overflow-hidden">
        <ScrollArea className="min-h-0 flex-1">
          <SidebarGroup>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => setCommandOpen(true)}
                  tooltip="搜索（⌘K）"
                >
                  <Search />
                  <span className="truncate">搜索</span>
                  <kbd className="bg-muted text-muted-foreground pointer-events-none ml-auto rounded-md border px-1.5 py-0.5 text-[10px] font-medium group-data-[collapsible=icon]:hidden">
                    {"⌘K"}
                  </kbd>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroup>
          {navGroups.map((props) => (
            <NavGroup key={props.title} {...props} />
          ))}
        </ScrollArea>
      </SidebarContent>
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
