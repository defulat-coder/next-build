export type { TaskStore } from "@next-build/db";

export interface TaskDispatcher {
  enqueue(taskId: string): void;
}
