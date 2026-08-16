import type { PermissionCode } from "@next-build/db/permissions";

interface BaseNavItem {
  title: string;
  badge?: string;
  icon?: React.ElementType;
  /** 菜单权限码：当前用户无此权限则该项不渲染（docs/architecture-rbac-menu.md §6）。 */
  permission?: PermissionCode;
}

export type NavItem =
  | (BaseNavItem & {
      items: (BaseNavItem & { url: string })[];
      url?: never;
    })
  | (BaseNavItem & {
      url: string;
      items?: never;
    });

interface NavGroup {
  title: string;
  items: NavItem[];
  /** 仅开发环境显示的组（如「参考演示」），生产构建整组不渲染。 */
  devOnly?: boolean;
}

interface SidebarData {
  navGroups: NavGroup[];
}

export type { NavGroup, SidebarData };
