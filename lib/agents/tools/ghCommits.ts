import { z } from "zod";
import { Tool, ToolResult, AgentContext } from "../core/types";
import { Octokit } from "octokit";

const REPO_OWNER = process.env.GITHUB_REPO_OWNER ?? 'invidias-codem';
const REPO_NAME = process.env.GITHUB_REPO_NAME ?? 'ai-saas';
const DEFAULT_BRANCH = process.env.GITHUB_DEFAULT_BRANCH ?? 'main';

function getOctokit(): Octokit {
  const token = process.env.GITHUB_AGENT_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('[gh_commits] GITHUB_AGENT_TOKEN is not configured');
  }
  return new Octokit({ auth: token });
}

const ROUTINE_PATTERNS = [
  /^(chore|bump|deps|dependency|typo|lint|format|test|docs|ci|build|release|merge|revert|style)\b/i,
  /^(chore|bump|deps|dependency|typo|lint|format|test|docs|ci|build|release|merge|revert|style)(\(|:)/i,
];

function isRoutineCommit(message: string): boolean {
  const firstLine = message.split('\n')[0].trim();
  return ROUTINE_PATTERNS.some(p => p.test(firstLine));
}

const GhCommitsInputSchema = z.object({
  since: z.string().datetime().optional().describe("ISO datetime for cutoff, default 7 days ago"),
  maxResults: z.coerce.number().int().min(1).max(50).optional().describe("Max commits to return"),
});

type GhCommitsInput = {
  since?: string;
  maxResults: number;
};

export const ghCommitsTool: Tool<GhCommitsInput, any> = {
  name: "gh_commits",
  description:
    "Fetch recent commits from the Lattice OS repo. Returns only high-signal commits; routine maintenance commits are filtered out.",
  schema: GhCommitsInputSchema as z.ZodType<GhCommitsInput>,
  risk: "read-only",
  requiresApproval: false,
  timeoutMs: 15000,

  async execute(input: GhCommitsInput, _context: AgentContext): Promise<ToolResult> {
    try {
      const octokit = getOctokit();
      const since = input.since
        ? new Date(input.since).toISOString()
        : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: commits } = await octokit.rest.repos.listCommits({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        sha: DEFAULT_BRANCH,
        since,
        per_page: input.maxResults ?? 20,
      });

      const filtered = commits
        .map((c: any) => ({
          sha: c.sha,
          message: c.commit?.message || '',
          authoredDate: c.commit?.author?.date,
          author: c.commit?.author?.name,
        }))
        .filter((c: any) => !isRoutineCommit(c.message));

      return {
        success: true,
        data: {
          since,
          total: filtered.length,
          commits: filtered,
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message ?? "Failed to fetch commits" };
    }
  },
};
