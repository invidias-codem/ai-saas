/**
 * UCOL Error Resolution Agent — CodebaseExplorer
 *
 * Uses the GitHub API to fetch the content of suspected files
 * and perform keyword searches to find related code.
 * Uses a server-side GitHub token — no user OAuth required.
 */

import { Octokit } from 'octokit';
import type { CodebaseFile } from './types';

const REPO_OWNER = process.env.GITHUB_REPO_OWNER ?? 'invidias-codem';
const REPO_NAME = process.env.GITHUB_REPO_NAME ?? 'ai-saas';
const DEFAULT_BRANCH = process.env.GITHUB_DEFAULT_BRANCH ?? 'main';

function getOctokit(): Octokit {
  const token = process.env.GITHUB_AGENT_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('[CodebaseExplorer] GITHUB_AGENT_TOKEN is not configured');
  }
  return new Octokit({ auth: token });
}

/**
 * Fetch a single file's content and SHA from GitHub.
 * Returns null if the file doesn't exist.
 */
export async function fetchFile(path: string): Promise<CodebaseFile | null> {
  const octokit = getOctokit();
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner: REPO_OWNER,
      repo: REPO_NAME,
      path,
      ref: DEFAULT_BRANCH,
    });

    if (Array.isArray(data) || data.type !== 'file') {
      return null;
    }

    const content = Buffer.from(data.content, 'base64').toString('utf-8');
    return { path, content, sha: data.sha };
  } catch (err: any) {
    if (err.status === 404) return null;
    throw err;
  }
}

/**
 * Fetch multiple files in parallel — skips any that 404.
 */
export async function fetchFiles(paths: string[]): Promise<CodebaseFile[]> {
  const results = await Promise.allSettled(paths.map(fetchFile));
  return results
    .filter((r): r is PromiseFulfilledResult<CodebaseFile | null> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter((f): f is CodebaseFile => f !== null);
}

/**
 * Search codebase for files matching a query string using GitHub Code Search.
 * Returns up to `limit` file paths.
 */
export async function searchCodebase(query: string, limit = 5): Promise<string[]> {
  const octokit = getOctokit();
  try {
    const { data } = await octokit.rest.search.code({
      q: `${query} repo:${REPO_OWNER}/${REPO_NAME}`,
      per_page: limit,
    });
    return data.items.map((item: any) => item.path);
  } catch (err: any) {
    console.warn('[CodebaseExplorer] Search failed:', err.message);
    return [];
  }
}

/**
 * Given a classified error, fetch the most relevant files.
 * Strategy:
 * 1. Fetch suspected files directly (from stack frames)
 * 2. If < 2 files found, supplement with a keyword search
 */
export async function gatherRelevantFiles(
  suspectedFiles: string[],
  searchTerms: string[]
): Promise<CodebaseFile[]> {
  const files = await fetchFiles(suspectedFiles);

  if (files.length < 2 && searchTerms.length > 0) {
    const query = searchTerms.slice(0, 3).join(' ');
    const searchPaths = await searchCodebase(query, 5);

    // Deduplicate against already fetched
    const fetched = new Set(files.map(f => f.path));
    const extra = searchPaths.filter(p => !fetched.has(p));
    const extraFiles = await fetchFiles(extra);
    files.push(...extraFiles);
  }

  return files;
}

/**
 * Create a new branch from main.
 */
export async function createBranch(branchName: string): Promise<void> {
  const octokit = getOctokit();

  // Get SHA of HEAD on default branch
  const { data: ref } = await octokit.rest.git.getRef({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    ref: `heads/${DEFAULT_BRANCH}`,
  });

  await octokit.rest.git.createRef({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    ref: `refs/heads/${branchName}`,
    sha: ref.object.sha,
  });
}

/**
 * Commit a file change to a branch.
 */
export async function commitFileToBranch(
  branchName: string,
  file: CodebaseFile,
  newContent: string,
  commitMessage: string
): Promise<void> {
  const octokit = getOctokit();

  await octokit.rest.repos.createOrUpdateFileContents({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    path: file.path,
    message: commitMessage,
    content: Buffer.from(newContent).toString('base64'),
    branch: branchName,
    sha: file.sha,
  });
}

/**
 * Open a pull request.
 */
export async function openPullRequest(
  branchName: string,
  title: string,
  body: string
): Promise<{ url: string; number: number }> {
  const octokit = getOctokit();

  const { data } = await octokit.rest.pulls.create({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    title,
    head: branchName,
    base: DEFAULT_BRANCH,
    body,
  });

  return { url: data.html_url, number: data.number };
}
