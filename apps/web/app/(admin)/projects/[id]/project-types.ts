export type ProjectDetailTab = "overview" | "tasks" | "wiki" | "repos" | "settings";

export interface ProjectRepoDto {
  id: string;
  repo: string;
  defaultBranch: string | null;
  isPrimary: boolean;
  accessStatus: "available" | "unavailable";
  lastValidatedAt: string;
  providerRepoId: string | null;
  canPush: boolean | null;
  canCreatePr: boolean | null;
  lastExecutionValidatedAt: string | null;
  version: number;
  addedAt: string;
}

export interface ProjectDetailDto {
  project: {
    id: string;
    name: string;
    description: string | null;
    problemStatement: string | null;
    desiredOutcome: string | null;
    successCriteria: string[];
    nonGoals: string | null;
    targetDate: string | null;
    lifecycleStatus: "planned" | "active" | "blocked" | "completed" | "archived";
    archivedAt: string | null;
    completionSummary: string | null;
    completionCriteriaResults: Array<{ criterion: string; passed: boolean; evidence?: string }>;
    completedAt: string | null;
    completedBy: string | null;
    version: number;
    createdAt: string;
    updatedAt: string;
  };
  repos: ProjectRepoDto[];
  readiness: "setup_required" | "ready" | "needs_attention";
  primaryRepo: ProjectRepoDto | null;
}

export interface TaskDetailDto {
  task: {
    id: string;
    projectId: string;
    title: string;
    requirement: string;
    acceptanceCriteria: string[];
    validationCommands: string[];
    nonGoals: string | null;
    riskNotes: string | null;
    status: "draft" | "queued" | "running" | "review" | "acceptance_pending" | "accepted" | "rejected" | "closed" | "failed" | "cancelled";
    canonicalRepo: string;
    defaultBranch: string;
    baseSha: string;
    branch: string;
    createdAt: string;
    updatedAt: string;
  };
  runs: Array<{
    id: string;
    attempt: number;
    stage: "queued" | "provisioning" | "running" | "publishing" | "succeeded" | "failed" | "cancelled" | "manual_repair";
    errorMessage: string | null;
    createdAt: string;
    completedAt: string | null;
  }>;
  delivery: {
    status: "none" | "branch_pushed" | "draft_pr_open" | "ready_for_review" | "merged" | "closed_unmerged";
    githubPrNumber: number | null;
    githubPrUrl: string | null;
    headSha: string | null;
    mergedSha: string | null;
  };
  acceptance: {
    status: "pending" | "accepted" | "rejected";
    criteriaResults: Array<{ criterion: string; passed: boolean; evidence?: string }>;
    environment: string | null;
    evidence: Array<{ label: string; url: string }>;
    notes: string | null;
    decidedBy: string | null;
    decidedAt: string | null;
    version: number;
  };
}

export interface KnowledgeStatusDto {
  documents: Array<{ id: string; repo: string; path: string; title: string; content: string }>;
  generations: Array<{
    id: string;
    sourceSet: Array<{ repo: string; sha: string }>;
    status: "queued" | "generating" | "published" | "failed";
    trigger: "manual" | "delivery_merged" | "initial";
    createdAt: string;
    startedAt: string | null;
    publishedAt: string | null;
    errorMessage: string | null;
  }>;
  publishedGeneration: KnowledgeStatusDto["generations"][number] | null;
  latestGeneration: KnowledgeStatusDto["generations"][number] | null;
  stale: boolean;
  asOf: string | null;
}
