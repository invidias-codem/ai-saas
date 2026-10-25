// lib/agents/tools/workspaceTools.ts
// Phase 1 (#442): read-only workspace discovery tools for Weaver.
// workspace_list — every accessible workspace (owned + accepted shared), deduped.
// workspace_describe — one authorized workspace's metadata + read capabilities.
// Both route through the single shared access seam (lib/security/workspaceAccess)
// and never create or mutate state. Denials are uniform and disclose nothing.

import { z } from "zod";
import { Tool } from "../core/types";
import {
  getWorkspaceAccess,
  listAccessibleWorkspaces,
  canWorkspaceRole,
  WORKSPACE_ACCESS_DENIED_MESSAGE,
} from "@/lib/security/workspaceAccess";

export const workspaceListTool: Tool<Record<string, never>, any> = {
  name: "workspace_list",
  description:
    "List the Lattice workspaces the current user can access: workspaces they own plus workspaces shared with them through an accepted membership. Each entry carries limited metadata (id, name, kind, role, access source). Read-only — never creates workspaces. Use the ids with workspace_describe or query_workspace_sources.",
  schema: z.object({}),
  risk: "read-only",
  execute: async (_input, context) => {
    if (!context.userId) {
      return { success: false, error: "Missing user context." };
    }
    const workspaces = await listAccessibleWorkspaces(context.userId);
    return { success: true, data: { workspaces } };
  },
};

export const workspaceDescribeTool: Tool<{ workspaceId: string }, any> = {
  name: "workspace_describe",
  description:
    "Describe one authorized workspace by id (from workspace_list): name, description, kind, and the read capabilities the caller's role permits. Reading another workspace describes it only — it never changes the conversation's selected workspace.",
  schema: z.object({
    workspaceId: z.string().uuid().describe("The workspace id, as listed by workspace_list."),
  }),
  risk: "read-only",
  execute: async (input, context) => {
    if (!context.userId) {
      return { success: false, error: "Missing user context." };
    }
    const access = await getWorkspaceAccess(context.userId, input.workspaceId);
    if (!access) {
      // Uniform denial: no existence or membership-state disclosure (#442).
      return { success: false, error: WORKSPACE_ACCESS_DENIED_MESSAGE };
    }
    const { supabaseAdmin } = await import("@/lib/supabaseClient");
    if (!supabaseAdmin) {
      return { success: false, error: "Database configuration missing." };
    }
    const { data: ws, error } = await supabaseAdmin
      .from("workspaces")
      .select("name, description, kind, is_default")
      .eq("id", input.workspaceId)
      .maybeSingle();
    if (error || !ws) {
      // Accepted membership to a since-deleted workspace: still uniform.
      return { success: false, error: WORKSPACE_ACCESS_DENIED_MESSAGE };
    }
    return {
      success: true,
      data: {
        workspace: {
          id: input.workspaceId,
          name: ws.name,
          description: ws.description ?? null,
          kind: ws.kind ?? null,
          is_default: ws.is_default ?? null,
        },
        role: access.role,
        accessSource: access.source,
        capabilities: {
          source_search: true, // query_workspace_sources applies the same shared check
          memory_read: canWorkspaceRole(access.role, "memory:read"),
          document_read: canWorkspaceRole(access.role, "document:read"),
        },
      },
    };
  },
};
