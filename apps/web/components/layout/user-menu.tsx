"use client";

import { LogOut } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Me {
  id: string;
  name: string;
  avatarUrl: string | null;
}

/** Header 右侧用户区：挂载后拉取 /api/auth/me，未登录（401）时不渲染。 */
export function UserMenu() {
  const router = useRouter();
  const [user, setUser] = useState<Me | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me")
      .then((res) => (res.ok ? (res.json() as Promise<Me>) : null))
      .then((data) => {
        if (!cancelled) setUser(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!user) return null;

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    // refresh 清掉已缓存的受保护页面 RSC 负载，再回登录页。
    router.refresh();
    router.push("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="用户菜单" className="rounded-full" size="icon" variant="ghost">
          {user.avatarUrl ? (
            <Image
              alt={user.name}
              className="h-8 w-8 rounded-full"
              height={32}
              src={user.avatarUrl}
              width={32}
            />
          ) : (
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
              {user.name.slice(0, 1)}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>{user.name}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={logout} variant="destructive">
          <LogOut className="h-4 w-4" />
          退出登录
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
