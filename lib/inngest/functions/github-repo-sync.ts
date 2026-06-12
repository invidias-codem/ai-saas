import { inngest, type GitHubRepoSyncEvent } from "@/lib/inngest/client";
import { getInstallationOctokit } from "@/lib/github-app";
import { chunkFile } from "@/lib/rag/astChunker";
import { storeMemoriesBulk } from "@/lib/memory/vectorStore";
import { supabaseAdmin } from "@/lib/supabaseClient";

// ─── Constants ───────────────────────────────────────────────────────────────

const CODE_EXTENSIONS = new Set([
  ".ts", ".tsx", ".js", ".jsx", ".py", ".java", ".go", ".rs",
  ".c", ".cpp", ".h", ".cs", ".rb", ".php", ".swift",
  ".kt", ".vue", ".svelte", ".css", ".scss", ".sql", ".sh", ".md",
]);

const SKIP_SEGMENTS = new Set([
  "node_modules", ".git", "dist", "build", ".next", "__pycache__",
  "venv", ".venv", ".idea", ".vscode",
]);

const SKIP_FILES = new Set([
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", ".DS_Store",
]);

/** 200 KB max per file */
const MAX_FILE_BYTES = 200 * 1024;
/** Guard against runaway embedding costs */
const MAX_FILES_PER_RUN = 500;
/** Files chunked + embedded per Inngest step */
const FILES_PER_BATCH = 10;

interface TreeFile {
  path: string;
  sha: string;
  size?: number;
}

// ─── Durable Function ─────────────────────────────────────────────────────────

/**
 * Durable GitHub repository sync function.
 *
 * Each step.run() call is independently retried (up to 3x) and checkpointed,
 * so a transient OpenAI or Supabase error in batch 12 won't re-parse batches 1-11.
 *
 * Steps:
 *   1. fetch-tree          - full blob list via Installation Access Token
 *   2. filter-files        - apply extension + skip rules
 *   3. chunk-embed-batch-N - fetch content, AST-chunk, generate embeddings (10 files/step)
 *   4. mark-complete       - upsert github_repo_syncs status row
 */
export const githubRepoSync = inngest.createFunction(
  {
    id: "github-repo-sync",
    name: "GitHub Repo Sync",
    retries: 3,
    concurrency: {
      // One active sync per user+repo at a time; new events queue behind it.
      key: "event.data.userId + '-' + event.data.owner + '-' + event.data.repo",
      limit: 1,
    },
    triggers: [{ event: "github/repo.sync" as GitHubRepoSyncEvent["name"] }],
  },

  async ({ event, step, logger }) => {
    const { installationId, owner, repo, userId, triggeredBy, commitSha } =
      event.data;
    const repoFullName = `${owner}/${repo}`;

    logger.info("[RepoSync] Starting", { repoFullName, triggeredBy });

    // Step 1: Fetch the full file tree
    const treeFiles = await step.run("fetch-tree", async () => {
      const octokit = await getInstallationOctokit(installationId);
      const { data: repoData } = await octokit.request("GET /repos/{owner}/{repo}", { owner, repo });
      const { data: treeData } = await octokit.request("GET /repos/{owner}/{repo}/git/trees/{tree_sha}", {
        owner,
        repo,
        tree_sha: repoData.default_branch,
        recursive: "true",
      });

      if (treeData.truncated) {
        logger.warn("[RepoSync] Tree truncated - very large repo");
      }

      return treeData.tree
        .filter(
          (item): item is typeof item & { path: string } =>
            item.type === "blob" && !!item.path
        )
        .map((item) => ({
          path: item.path!,
          size: item.size,
        })) as TreeFile[];
    }) as TreeFile[];

    // Step 2: Filter to indexable files (pure CPU, no network)
    const filesToIndex = await step.run("filter-files", async () => {
      return treeFiles
        .filter((f) => {
          const segs = f.path.split("/");
          const filename = segs[segs.length - 1];
          const ext = "." + (filename.split(".").pop()?.toLowerCase() ?? "");
          if (segs.some((s) => SKIP_SEGMENTS.has(s))) return false;
          if (SKIP_FILES.has(filename)) return false;
          if (f.size !== undefined && f.size > MAX_FILE_BYTES) return false;
          return CODE_EXTENSIONS.has(ext);
        })
        .slice(0, MAX_FILES_PER_RUN);
    }) as TreeFile[];

    logger.info(`[RepoSync] ${filesToIndex.length} files to index`);

    // Step 3: Chunk + embed in rolling batches of FILES_PER_BATCH
    let totalIndexed = 0;

    for (let i = 0; i < filesToIndex.length; i += FILES_PER_BATCH) {
      const batch = filesToIndex.slice(i, i + FILES_PER_BATCH);
      const batchNum = Math.floor(i / FILES_PER_BATCH) + 1;

      const indexed = await step.run(`chunk-embed-batch-${batchNum}`, async () => {
        const octokit = await getInstallationOctokit(installationId);
        const memoriesToStore: Array<{
          content: string;
          type: "code_chunk";
          metadata: Record<string, unknown>;
        }> = [];

        await Promise.all(
          batch.map(async (file) => {
            try {
              const { data: fileData } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
                owner,
                repo,
                path: file.path,
              });

              if (!("content" in fileData) || fileData.encoding !== "base64") return;

              const content = Buffer.from(fileData.content, "base64").toString("utf-8");
              // Guard against binary files slipping through
              if (/[\x00-\x08\x0E-\x1F]/.test(content.substring(0, 200))) return;

              const chunks = chunkFile(content, file.path);
              const language = langFromPath(file.path);

              for (const chunk of chunks) {
                memoriesToStore.push({
                  content: chunk.content,
                  type: "code_chunk",
                  metadata: {
                    repo: repoFullName,
                    filePath: chunk.filePath,
                    logicalName: chunk.logicalName,
                    chunkType: chunk.chunkType,
                    startLine: chunk.startLine,
                    endLine: chunk.endLine,
                    dependencies: chunk.dependencies ?? [],
                    language,
                    source: "github_app_sync",
                    triggeredBy,
                    commitSha: commitSha ?? null,
                    indexedAt: new Date().toISOString(),
                    featureType: "github",
                  },
                });
              }
            } catch (err) {
              // Per-file errors are non-fatal - log and continue the batch
              logger.warn(`[RepoSync] Skipping ${file.path}: ${String(err)}`);
            }
          })
        );

        if (memoriesToStore.length === 0) return 0;

        // storeMemoriesBulk handles concurrent embedding (max 15) and
        // bulk Supabase inserts (100/batch) internally
        const ids = await storeMemoriesBulk(userId, memoriesToStore, {
          scope: "workspace",
          workspaceId: repoFullName,
        });

        return ids.length;
      });

      totalIndexed += indexed;
    }

    // Step 4: Persist sync status
    await step.run("mark-complete", async () => {
      if (!supabaseAdmin) {
        logger.warn("[RepoSync] supabaseAdmin unavailable - skipping status upsert");
        return;
      }
      await supabaseAdmin
        .from("github_repo_syncs")
        .upsert(
          {
            user_id: userId,
            repo: repoFullName,
            status: "complete",
            inngest_run_id: event.id,
            files_indexed: totalIndexed,
            last_commit: commitSha ?? null,
            synced_at: new Date().toISOString(),
          },
          { onConflict: "user_id,repo" }
        );
    });

    logger.info("[RepoSync] Done", { repoFullName, totalIndexed });
    return { repoFullName, totalIndexed };
  }
);

// ─── Util ─────────────────────────────────────────────────────────────────────

function langFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
    py: "python", go: "go", rs: "rust", rb: "ruby", java: "java",
    php: "php", swift: "swift", kt: "kotlin", cs: "csharp",
    md: "markdown", sh: "shell", yaml: "yaml", json: "json", sql: "sql",
    vue: "vue", svelte: "svelte", css: "css", scss: "scss",
  };
  return map[ext] ?? ext ?? "unknown";
}
