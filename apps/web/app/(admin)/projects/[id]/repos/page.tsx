import { ProjectDetailView } from "../project-detail-view";

export default async function ProjectReposPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main id="main-content" className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ProjectDetailView projectId={id} activeTab="repos" />
    </main>
  );
}
