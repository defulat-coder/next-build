"use client";

import { LogOut } from "lucide-react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { toast } from "sonner";

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
      .catch(() => {
        // 401/未登录走上面的 null 分支不会进这里；进这里即网络级失败
        toast.error("用户信息加载失败，请刷新重试");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!user) return null;

  const logout = async () => {
    const res = await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    if (!res?.ok) {
      toast.error("退出失败，请重试");
      return;
    }
    // refresh 清掉已缓存的受保护页面 RSC 负载，再回登录页。
    router.refresh();
    router.push("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button aria-label="用户菜单" className="rounded-full" size="icon" variant="ghost">
          {user.avatarUrl ? (
            // 小头像不走服务端图片优化器（本机代理 fake-ip 会触发 Next SSRF 拦截），浏览器直连 CDN。
            <Image
              alt={user.name}
              className="h-8 w-8 rounded-full"
              height={32}
              src={user.avatarUrl}
              unoptimized
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
