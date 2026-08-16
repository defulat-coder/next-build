"use client";

import { ChevronsUpDown, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import * as React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  applyThemePresetToDocument,
  getPresetLabel,
  listPresetIdsSorted,
  THEME_PRESET_STORAGE_KEY,
} from "@/lib/theme-preset-apply";

/** GET /api/auth/me 的响应形状（server/domains/auth/model.ts 的 AuthUser）。 */
interface CurrentUser {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** 主题模式 + 主题预设（原顶栏右侧控件，现归置到用户菜单）。 */
function ThemeMenuItems() {
  const { theme, setTheme } = useTheme();
  const [presetId, setPresetId] = React.useState<string | null>(null);

  // 挂载时读 localStorage 并应用预设（原 theme-preset-selector 的职责）。
  React.useEffect(() => {
    const saved = localStorage.getItem(THEME_PRESET_STORAGE_KEY);
    setPresetId(saved ?? "default");
  }, []);

  React.useEffect(() => {
    if (presetId === null) return;
    applyThemePresetToDocument(presetId);
    localStorage.setItem(THEME_PRESET_STORAGE_KEY, presetId);
  }, [presetId]);

  const presetIds = React.useMemo(() => listPresetIdsSorted(), []);

  return (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>主题</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          <DropdownMenuRadioGroup
            value={theme}
            onValueChange={(v) => setTheme(v)}
          >
            <DropdownMenuRadioItem value="light">浅色</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">深色</DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="system">
              跟随系统
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>主题预设</DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="p-0">
          <ScrollArea className="h-72">
            <div className="p-1">
              <DropdownMenuRadioGroup
                value={presetId ?? "default"}
                onValueChange={setPresetId}
              >
                {presetIds.map((id) => (
                  <DropdownMenuRadioItem key={id} value={id}>
                    {getPresetLabel(id)}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </div>
          </ScrollArea>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
    </>
  );
}

export function NavUser() {
  const { isMobile } = useSidebar();
  const router = useRouter();
  const [user, setUser] = React.useState<CurrentUser | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: CurrentUser | null) => {
        if (!cancelled) setUser(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  const name = user?.name ?? "…";
  const fallback = (user?.name ?? "U").slice(0, 1).toUpperCase();

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              <Avatar className="h-8 w-8 rounded-lg">
                <AvatarImage src={user?.avatarUrl ?? undefined} alt={name} />
                <AvatarFallback className="rounded-lg">
                  {fallback}
                </AvatarFallback>
              </Avatar>
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{name}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuLabel className="p-0 font-normal">
              <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarImage src={user?.avatarUrl ?? undefined} alt={name} />
                  <AvatarFallback className="rounded-lg">
                    {fallback}
                  </AvatarFallback>
                </Avatar>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">{name}</span>
                </div>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <ThemeMenuItems />
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout}>
              <LogOut />
              退出登录
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
