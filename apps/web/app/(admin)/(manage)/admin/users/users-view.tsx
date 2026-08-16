"use client";

import type { SiteRoleCode } from "@next-build/db/permissions";
import { format } from "date-fns";
import { IconUsers } from "@tabler/icons-react";
import * as React from "react";

import { PageHeader } from "@/components/layout/page-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { readApiError } from "@/lib/api-error";
import { toast } from "@/lib/toast";

/** GET /api/admin/users 的列表项（packages/db UserWithRoles；日期经 JSON 序列化为字符串）。 */
interface UserWithRolesDto {
  id: string;
  name: string;
  avatarUrl: string | null;
  siteRole: SiteRoleCode | null;
  lastLoginAt: string;
}

/** 可选整站角色（site:viewer 本期预留不启用，docs/architecture-rbac-menu.md §1.1）。 */
const SITE_ROLE_OPTIONS: { value: SiteRoleCode; label: string }[] = [
  { value: "site:admin", label: "管理员" },
  { value: "site:member", label: "成员" },
];

function siteRoleLabel(role: SiteRoleCode | null): string {
  return SITE_ROLE_OPTIONS.find((option) => option.value === role)?.label ?? "未分配";
}

export function UsersView() {
  const [users, setUsers] = React.useState<UserWithRolesDto[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/users");
      if (!res.ok) {
        setLoadError(await readApiError(res));
        return;
      }
      setUsers(await res.json());
    } catch {
      setLoadError("网络异常，请重试。");
    }
  }, []);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <>
      <PageHeader title="用户与角色" description="管理注册用户及其整站角色。" />

      {loadError ? (
        <p className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm" role="alert">
          {loadError}
        </p>
      ) : null}

      {users === null && !loadError ? (
        <p className="text-muted-foreground text-sm">加载中…</p>
      ) : users !== null && users.length === 0 ? (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center">
          <IconUsers className="text-muted-foreground size-8" />
          <p className="font-medium">还没有用户</p>
        </div>
      ) : (
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>用户</TableHead>
                <TableHead>整站角色</TableHead>
                <TableHead>最近登录</TableHead>
                <TableHead className="w-28 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users?.map((user) => (
                <TableRow key={user.id}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar className="size-8 rounded-lg">
                        <AvatarImage src={user.avatarUrl ?? undefined} alt={user.name} />
                        <AvatarFallback className="rounded-lg">
                          {user.name.slice(0, 1).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium">{user.name}</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        user.siteRole === "site:admin"
                          ? "bg-primary/10 text-primary"
                          : "bg-muted text-muted-foreground"
                      }
                    >
                      {siteRoleLabel(user.siteRole)}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {format(new Date(user.lastLoginAt), "yyyy-MM-dd HH:mm")}
                  </TableCell>
                  <TableCell className="text-right">
                    <EditSiteRoleDialog user={user} onUpdated={load} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}

function EditSiteRoleDialog({
  user,
  onUpdated,
}: {
  user: UserWithRolesDto;
  onUpdated: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [role, setRole] = React.useState<SiteRoleCode>(user.siteRole ?? "site:member");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${user.id}/site-role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) {
        setError(await readApiError(res));
        return;
      }
      setOpen(false);
      toast({ title: `已将 ${user.name} 的整站角色改为「${siteRoleLabel(role)}」` });
      onUpdated();
    } catch {
      setError("网络异常，请重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        修改角色
      </Button>
      <DialogContent>
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>修改整站角色</DialogTitle>
            <DialogDescription>
              整站角色决定用户「能在平台做什么」，项目内权限由项目角色单独判定。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="site-role">{user.name} 的整站角色</Label>
              <Select value={role} onValueChange={(value) => setRole(value as SiteRoleCode)}>
                <SelectTrigger id="site-role">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SITE_ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {error ? (
              <p className="bg-destructive/10 text-destructive rounded-lg px-3 py-2 text-sm" role="alert">
                {error}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              取消
            </Button>
            <Button type="submit" disabled={submitting || role === user.siteRole}>
              {submitting ? "保存中…" : "保存"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
