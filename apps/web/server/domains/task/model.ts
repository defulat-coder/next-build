export type { AcceptanceCriterionResult, AcceptanceEvidence, Delivery, DeliveryStatus, Task, TaskAcceptance, TaskDetail, TaskRun, TaskRunStage, TaskStatus } from "@next-build/db";

import type { TaskStatus } from "@next-build/db";

const transitions: Record<TaskStatus, readonly TaskStatus[]> = {
  acceptance_pending: ["accepted", "rejected"],
  accepted: ["closed"],
  cancelled: [],
  closed: [],
  draft: ["queued", "cancelled"],
  failed: ["queued", "cancelled"],
  rejected: ["closed"],
  queued: ["running", "failed", "cancelled"],
  review: ["acceptance_pending", "failed", "cancelled"],
  running: ["review", "failed", "cancelled"],
};

export function canTransitionTask(from: TaskStatus, to: TaskStatus): boolean {
  return transitions[from].includes(to);
}
