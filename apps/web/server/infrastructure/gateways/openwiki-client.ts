import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";

import { err, ok } from "@next-build/result";
import type { KnowledgeDocument, KnowledgeSourceFile } from "@next-build/db";

import type { KnowledgeGenerator } from "@/server/domains/knowledge/ports";

const exec = promisify(execFile);
const MAX_SOURCE_BYTES = 256_000;
const ignoredSource = /(^|\/)(?:dist|build|coverage|\.next|vendor)\/|(?:^|\/)(?:pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$|\.min\.(?:js|css)$/;

export function createOpenWikiGenerator(config: { anthropicApiKey: string; githubToken: string }): KnowledgeGenerator {
  return {
    async generate(generation) {
      const root = await mkdtemp(path.join(tmpdir(), `next-build-wiki-${generation.id}-`));
      try {
        const auth = Buffer.from(`x-access-token:${config.githubToken}`).toString("base64");
        const gitEnv = {
          ...process.env,
          GIT_CONFIG_COUNT: "1",
          GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
          GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${auth}`,
        };
        const documents: KnowledgeDocument[] = [];
        const sources: KnowledgeSourceFile[] = [];
        for (const source of generation.sourceSet) {
          const repoDir = path.join(root, source.repo.replaceAll("/", "--"));
          await exec("git", ["clone", "--depth", "1", `https://github.com/${source.repo}.git`, repoDir], { env: gitEnv, timeout: 120_000 });
          await exec("git", ["checkout", source.sha], { cwd: repoDir, env: gitEnv, timeout: 30_000 });
          const openwiki = path.join(process.cwd(), "node_modules", ".bin", "openwiki");
          await exec(openwiki, ["--print", "生成面向研发交付的中文项目 Wiki，优先说明架构、运行方式、关键流程与验证方法。"], {
            cwd: repoDir,
            env: { ...process.env, ANTHROPIC_API_KEY: config.anthropicApiKey, OPENWIKI_PROVIDER: "anthropic", OPENWIKI_TELEMETRY_DISABLED: "1" },
            maxBuffer: 4 * 1024 * 1024,
            timeout: 30 * 60_000,
          });
          const wikiRoot = path.join(repoDir, "openwiki");
          for (const file of await walk(wikiRoot).catch(() => [])) {
            if (!file.endsWith(".md")) continue;
            const content = await readFile(file, "utf8");
            const relative = path.relative(wikiRoot, file);
            documents.push({ content, generationId: generation.id, id: randomUUID(), path: relative, projectId: generation.projectId, repo: source.repo, title: content.match(/^#\s+(.+)$/m)?.[1] ?? path.basename(relative, ".md") });
          }
          const { stdout } = await exec("git", ["ls-files", "-z"], { cwd: repoDir, timeout: 30_000 });
          for (const relative of stdout.split("\0").filter(Boolean)) {
            if (ignoredSource.test(relative) || relative.startsWith("openwiki/")) continue;
            const buffer = await readFile(path.join(repoDir, relative));
            if (buffer.includes(0)) continue;
            const truncated = buffer.byteLength > MAX_SOURCE_BYTES;
            sources.push({
              content: buffer.subarray(0, MAX_SOURCE_BYTES).toString("utf8"), generationId: generation.id,
              id: randomUUID(), language: languageOf(relative), path: relative, projectId: generation.projectId,
              repo: source.repo, truncated,
            });
          }
        }
        if (documents.length === 0) return err({ code: "KNOWLEDGE_GENERATION_FAILED", message: "OpenWiki 未生成 Markdown 文档" });
        return ok({ documents, sources });
      } catch (cause) {
        return err({ cause, code: "KNOWLEDGE_GENERATION_FAILED", message: "OpenWiki 生成失败" });
      } finally {
        await rm(root, { force: true, recursive: true });
      }
    },
  };
}

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  }));
  return nested.flat();
}
function languageOf(file: string): string | null {
  return ({ ".js": "javascript", ".jsx": "javascript", ".ts": "typescript", ".tsx": "typescript", ".py": "python", ".go": "go", ".rs": "rust", ".md": "markdown" } as Record<string, string>)[path.extname(file).toLowerCase()] ?? null;
}
