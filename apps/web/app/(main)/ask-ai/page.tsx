import { MessageSquareText } from "lucide-react";

import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";

export const metadata = { title: "Ask AI · Next Build" };

export default function AskAiPage() {
  return (
    <EmptyState
      action={
        <Button className="mt-2 rounded-full" disabled size="sm" title="需要先生成 Wiki" variant="outline">
          开始提问
        </Button>
      }
      description="基于 Wiki 文档与源文件的全文检索问答，生成 Wiki 后即可提问。"
      icon={MessageSquareText}
      title="Ask AI"
    />
  );
}
