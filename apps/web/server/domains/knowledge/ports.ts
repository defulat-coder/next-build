export type { KnowledgeStore } from "@next-build/db";

import type { KnowledgeDocument, KnowledgeGeneration, KnowledgeSourceFile } from "@next-build/db";
import type { Result } from "@next-build/result";

export interface KnowledgeGenerationError { code: "KNOWLEDGE_GENERATION_FAILED"; message: string; cause?: unknown }
export interface KnowledgeGenerator {
  generate(generation: KnowledgeGeneration): Promise<Result<{ documents: KnowledgeDocument[]; sources: KnowledgeSourceFile[] }, KnowledgeGenerationError>>;
}
export interface KnowledgeDispatcher { enqueue(generationId: string): void }
