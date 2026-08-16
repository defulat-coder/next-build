import { SidebarTrigger } from "@/components/ui/sidebar";

interface PageHeaderProps {
  title: string;
  description?: string;
  /** 右侧操作区（如「新建项目」按钮）。 */
  actions?: React.ReactNode;
}

/** 页面标题行：侧边栏开关固定在标题左边（收起后按钮仍留在此处，不随侧边栏消失）。 */
export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="mb-4 flex items-start justify-between gap-2">
      <div>
        <div className="flex items-center gap-2">
          {/* 移动端由 (admin)/layout 的窄屏顶栏提供开关，此处不重复 */}
          <SidebarTrigger className="size-8 shrink-0 max-md:hidden" />
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        </div>
        {description ? (
          <p className="text-muted-foreground mt-1 text-sm">{description}</p>
        ) : null}
      </div>
      {actions}
    </div>
  );
}
