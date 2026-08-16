import type { Metadata } from "next";

import { ProjectsView } from "./projects-view";

export const metadata: Metadata = { title: "项目 · Next Build" };

export default function ProjectsPage() {
  return <ProjectsView />;
}
