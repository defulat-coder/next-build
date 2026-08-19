import { ProjectDetailView } from "../project-detail-view";

export default async function ProjectReposPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main id="main-content" className="flex min-h-min flex-1 flex-col p-4 sm:p-6">
      <ProjectDetailView projectId={id} activeTab="repos" />
    </main>
  );
}
