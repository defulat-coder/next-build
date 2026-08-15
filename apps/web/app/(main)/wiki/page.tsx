import { BookOpen } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Wiki · Next Build" };

export default function WikiPage() {
  return (
    <EmptyState
      action={
        <Button className="mt-2 rounded-full" disabled size="sm" title="仓库选择即将上线" variant="outline">
          选择仓库
        </Button>
      }
      description="选择仓库生成 Wiki 后，OpenWiki 产出的文档会展示在这里。"
      icon={BookOpen}
      title="还没有 Wiki"
    />
  );
}
