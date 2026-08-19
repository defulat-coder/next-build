export type ProjectDetailTab = "overview" | "repos" | "settings";

export interface ProjectRepoDto {
  id: string;
  repo: string;
  defaultBranch: string | null;
  isPrimary: boolean;
  accessStatus: "available" | "unavailable";
  lastValidatedAt: string;
  addedAt: string;
}

export interface ProjectDetailDto {
  project: {
    id: string;
    name: string;
    description: string | null;
    createdAt: string;
    updatedAt: string;
  };
  repos: ProjectRepoDto[];
  readiness: "setup_required" | "ready" | "needs_attention";
  primaryRepo: ProjectRepoDto | null;
}
