// lib/agents/tools/connectionTools.ts
// Phase 2A (#444): connection discovery + read-only GitHub access.
//
// Identity is the boundary: credentials resolve from the authenticated
// runtime identity (context.userId) ONLY — the schemas carry no user-id
// input, so a model can never target another user's credentials, and shared
// workspace membership grants nothing here. Read-only; no writes.

import { z } from "zod";
import { Tool } from "../core/types";
import {
  getConnections,
  resolveConnectionCredential,
  classifyGitHubError,
  ConnectionLookupError,
} from "@/lib/integrations/connectionService";

export const connectionsListTool: Tool<Record<string, never>, any> = {
  name: "connections_list",
  description:
    "List the external tools the CURRENT user has connected (GitHub, Trello, Slack), each with its connection state. A stored credential that has not been verified against the provider reads as 'unverified' — never as connected. Read-only and makes no external calls. Use github_list_repositories to actually use (and thereby verify) a GitHub connection.",
  schema: z.object({}),
  risk: "read-only",
  execute: async (_input, context) => {
    if (!context.userId) {
      return { success: false, error: "Missing user context." };
    }
    try {
      const connections = await getConnections(context.userId);
      return { success: true, data: { connections } };
    } catch (err) {
      if (err instanceof ConnectionLookupError) {
        return { success: false, error: `Connection inventory failed (${err.code}): ${err.message}` };
      }
      return { success: false, error: "Connection inventory failed." };
    }
  },
};

export const githubListRepositoriesTool: Tool<{ page?: number; perPage?: number }, any> = {
  name: "github_list_repositories",
  description:
    "List the GitHub repositories of the CURRENT user, using their own persisted GitHub credential (never another user's). Bounded and paginated: pass page/perPage (max 100 per page); the result reports hasMore and nextPage — a page is never 'all repositories'. Returns safe repository metadata plus verification evidence (verifiedAt, method, request id) for this exact operation.",
  schema: z.object({
    page: z.number().int().min(1).optional().describe("Page number, 1-based. Defaults to 1."),
    perPage: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .describe("Repositories per page (1-100). Defaults to 30."),
  }),
  risk: "read-only",
  timeoutMs: 20_000,
  execute: async (input, context) => {
    if (!context.userId) {
      return { success: false, error: "Missing user context." };
    }
    const page = input.page ?? 1;
    const perPage = input.perPage ?? 30;

    let credential: { service: string; token: string } | null;
    try {
      credential = await resolveConnectionCredential(context.userId, "github");
    } catch (err) {
      if (err instanceof ConnectionLookupError) {
        return { success: false, error: `GitHub credential lookup failed (${err.code}): ${err.message}` };
      }
      return { success: false, error: "GitHub credential lookup failed." };
    }

    if (!credential) {
      // No provider request is made in this state (#444 acceptance).
      return {
        success: false,
        error: "GitHub is not connected. Connect your GitHub account first.",
        data: { connectionStatus: "not_connected" },
      };
    }

    try {
      const { getOctokit } = await import("@/lib/github");
      const octokit = getOctokit(credential.token);
      const response = await octokit.rest.repos.listForAuthenticatedUser({
        per_page: perPage,
        page,
        sort: "updated",
      });
      const items = (response.data ?? []) as Array<{
        id: number;
        full_name: string;
        private: boolean;
        description: string | null;
        language: string | null;
        updated_at: string;
        html_url?: string;
        owner?: { login?: string };
      }>;

      const hasMore = items.length === perPage;
      return {
        success: true,
        data: {
          repositories: items.map((r) => ({
            id: r.id,
            fullName: r.full_name,
            private: r.private,
            description: r.description ?? null,
            language: r.language ?? null,
            updatedAt: r.updated_at,
            owner: r.owner?.login ?? null,
            url: r.html_url ?? null,
          })),
          pagination: {
            page,
            perPage,
            hasMore,
            nextPage: hasMore ? page + 1 : null,
            note: hasMore
              ? "More repositories are available — pass nextPage to continue. This page is not the complete list."
              : "End of results: this listing has no further pages.",
          },
          verification: {
            verifiedAt: new Date().toISOString(),
            method: "github:repos.listForAuthenticatedUser",
            account: items[0]?.owner?.login ?? null,
            requestId:
              ((response.headers as Record<string, unknown>)["x-github-request-id"] as string | undefined) ??
              null,
          },
          connectionStatus: "connected_verified",
        },
      };
    } catch (err) {
      const classified = classifyGitHubError(err);
      return {
        success: false,
        error: `${classified.status}: ${classified.message}`,
        data: { connectionStatus: classified.status, evidence: classified.evidence },
      };
    }
  },
};
