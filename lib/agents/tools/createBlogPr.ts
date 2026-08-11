import { z } from "zod";
import { Tool, ToolResult, AgentContext } from "../core/types";
import { Octokit } from "octokit";

const REPO_OWNER = process.env.GITHUB_REPO_OWNER ?? 'invidias-codem';
const REPO_NAME = process.env.GITHUB_REPO_NAME ?? 'ai-saas';
const DEFAULT_BRANCH = process.env.GITHUB_DEFAULT_BRANCH ?? 'main';

function getOctokit(): Octokit {
  const token = process.env.GITHUB_AGENT_TOKEN ?? process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error('[create_blog_pr] GITHUB_AGENT_TOKEN is not configured');
  }
  return new Octokit({ auth: token });
}

function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
}

function buildMdxFrontmatter(title: string, publishedAt: string, description: string, category: string, tags: string[]): string {
  const tagList = tags.map(t => `"${t.replace(/"/g, '')}"`).join(', ');
  return `---
title: "${title.replace(/"/g, '')}"
publishedAt: "${publishedAt.replace(/"/g, '').slice(0, 10)}"
description: "${description.replace(/"/g, '')}"
author: "joshua-jair"
category: "${category.replace(/"/g, '')}"
tags: [${tagList}]
---

`;
}

const CreateBlogPrInputSchema = z.object({
  slug: z.string().min(1).max(120).describe("Blog post slug, e.g. lattice-os-weekly-update"),
  title: z.string().min(1).max(200).describe("Post title"),
  content: z.string().min(100).describe("Full MDX body content without frontmatter"),
  description: z.string().min(1).max(300).describe("Short post description for frontmatter"),
  category: z.string().min(1).max(100).describe("Category slug"),
  tags: z.array(z.string().min(1).max(50)).max(10).optional().describe("Tags array"),
  date: z.string().datetime().optional().describe("ISO date for publishedAt, default today"),
});

type CreateBlogPrInput = z.infer<typeof CreateBlogPrInputSchema>;

export const createBlogPrTool: Tool<CreateBlogPrInput, any> = {
  name: "create_blog_pr",
  description:
    "Composite tool: creates a branch, writes a blog MDX post, commits, pushes, and opens a PR. Use this instead of raw git commands.",
  schema: CreateBlogPrInputSchema,
  risk: "mutative",
  requiresApproval: false,
  timeoutMs: 60000,

  async execute(input: CreateBlogPrInput, _context: AgentContext): Promise<ToolResult> {
    try {
      const octokit = getOctokit();
      const normalizedSlug = normalizeSlug(input.slug);
      const datePrefix = input.date ? input.date.slice(0, 10) : new Date().toISOString().slice(0, 10);
      const baseBranchName = `genie/blog-${datePrefix}-${normalizedSlug}`;
      const filePath = `content/blog/${datePrefix}-${normalizedSlug}.mdx`;

      // Find a unique branch name
      let branchName = baseBranchName;
      let attempt = 2;
      while (true) {
        try {
          await octokit.rest.git.getRef({
            owner: REPO_OWNER,
            repo: REPO_NAME,
            ref: `heads/${branchName}`,
          });
          branchName = `${baseBranchName}-${attempt}`;
          attempt += 1;
        } catch (err: any) {
          if (err.status === 404) break;
          throw err;
        }
      }

      // Create branch from main
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

      const publishedAt = input.date ?? new Date().toISOString();
      const frontmatter = buildMdxFrontmatter(
        input.title,
        publishedAt,
        input.description ?? input.title,
        input.category,
        input.tags ?? ['lattice-os']
      );

      const fullContent = frontmatter + input.content.trim() + '\n';

      // Create file on branch
      await octokit.rest.repos.createOrUpdateFileContents({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        path: filePath,
        message: `blog: ${input.title}`,
        content: Buffer.from(fullContent).toString('base64'),
        branch: branchName,
      });

      const prTitle = `blog: ${input.title}`;
      const prBody = `Automated weekly blog post.\n\n- **Slug**: ${normalizedSlug}\n- **Category**: ${input.category}\n- **File**: ${filePath}\n`;

      const { data: pr } = await octokit.rest.pulls.create({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        title: prTitle,
        head: branchName,
        base: DEFAULT_BRANCH,
        body: prBody,
      });

      // Add auto-merge label so blog-automation can proceed
      await octokit.rest.issues.addLabels({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        issue_number: pr.number,
        labels: ['blog-automation'],
      });

      return {
        success: true,
        data: {
          prNumber: pr.number,
          prUrl: pr.html_url,
          branch: branchName,
          filePath,
        },
      };
    } catch (error: any) {
      return { success: false, error: error.message ?? "Failed to create blog PR" };
    }
  },
};
