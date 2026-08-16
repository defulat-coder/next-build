import type { Metadata } from "next";

import { ProjectDetailView } from "./project-detail-view";

export const metadata: Metadata = { title: "项目详情 · Next Build" };

export default async function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProjectDetailView id={id} />;
}
