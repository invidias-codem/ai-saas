import { z } from "zod";
import { Tool } from "../core/types";

export const discoverDocumentsTool: Tool<{ path: string }, any> = {
    name: "discover_documents_secure",
    description: "Recursively scan a directory for supported text and code files. Returns structured metadata (paths, sizes, extensions). Use this to find all editable or readable files within a specific folder.",
    schema: z.object({
        path: z.string().describe("The absolute directory path to scan.")
    }),
    risk: "read-only",
    execute: async (input, context) => {
        if (!context.ioHarness) {
            return { success: false, error: "Execution harness is not available in the current context." };
        }
        if (!context.workspaceId) {
            return { success: false, error: "System Error: Missing workspace context. Local execution blocked by containment policy." };
        }
        const res = await context.ioHarness.discoverDocuments(input.path, context.workspaceId, context.userId);
        
        if (!res.ok) {
            return { success: false, error: res.error };
        }
        
        try {
            if (res.output) return { success: true, data: JSON.parse(res.output) };
        } catch (e) {
            return { success: true, data: res.output };
        }
        return { success: true, data: res };
    }
};

export const extractTextTool: Tool<{ path: string }, any> = {
    name: "extract_text_secure",
    description: "Read a local text or source code file up to 100KB in size. ONLY use this on individual files discovered via list_directory or discover_documents. Unsupported file types and files larger than 100KB will be strictly rejected.",
    schema: z.object({
        path: z.string().describe("The absolute path of the text file to read.")
    }),
    risk: "read-only",
    execute: async (input, context) => {
        if (!context.ioHarness) {
            return { success: false, error: "Execution harness is not available in the current context." };
        }
        if (!context.workspaceId) {
            return { success: false, error: "System Error: Missing workspace context. Local execution blocked by containment policy." };
        }
        const res = await context.ioHarness.extractText(input.path, context.workspaceId, context.userId);
        
        if (!res.ok) {
            return { success: false, error: res.error };
        }
        
        try {
            if (res.output) return { success: true, data: JSON.parse(res.output) };
        } catch (e) {
            return { success: true, data: res.output };
        }
        return { success: true, data: res };
    }
};

export const summarizeRepoTool: Tool<{ path: string }, any> = {
    name: "summarize_repo_secure",
    description: "Scan a directory to generate a high-level summary of the repository structure (top-level folders, major configs, file distribution). Use this FIRST when exploring a new codebase to map it without wasting context window.",
    schema: z.object({
        path: z.string().describe("The absolute path of the repository root to summarize.")
    }),
    risk: "read-only",
    execute: async (input, context) => {
        if (!context.ioHarness) {
            return { success: false, error: "Execution harness is not available in the current context." };
        }
        if (!context.workspaceId) {
            return { success: false, error: "System Error: Missing workspace context. Local execution blocked by containment policy." };
        }
        const res = await context.ioHarness.summarizeRepo(input.path, context.workspaceId, context.userId);
        
        if (!res.ok) {
            return { success: false, error: res.error };
        }
        
        try {
            if (res.output) return { success: true, data: JSON.parse(res.output) };
        } catch (e) {
            return { success: true, data: res.output };
        }
        return { success: true, data: res };
    }
};

export const semanticSearchTool: Tool<{ query: string }, any> = {
    name: "semantic_search_secure",
    description: "Perform a semantic vector search across the workspace to find relevant code chunks or files based on a natural language query. Use this to find functions, concepts, or business logic scattered across the codebase.",
    schema: z.object({
        query: z.string().describe("The natural language search query to embed and find across the repository.")
    }),
    risk: "read-only",
    execute: async (input, context) => {
        if (!context.ioHarness) {
            return { success: false, error: "Execution harness is not available in the current context." };
        }
        if (!context.workspaceId) {
            return { success: false, error: "System Error: Missing workspace context. Local execution blocked by containment policy." };
        }
        const res = await context.ioHarness.semanticSearch(input.query, context.workspaceId, context.userId);
        
        if (!res.ok) {
            return { success: false, error: res.error };
        }
        
        try {
            if (res.output) return { success: true, data: JSON.parse(res.output) };
        } catch (e) {
            return { success: true, data: res.output };
        }
        return { success: true, data: res };
    }
};

export const workspaceSourcesSearchTool: Tool<{ query: string }, any> = {
    name: "query_workspace_sources",
    description: "Searches the user's dedicated workspace knowledge base (Data Refinery) for factual market data, competitor intelligence, and provided documentation. Always use this to verify facts before answering domain-specific queries. Each result contains: (1) content — the factual text you must cite, and (2) lineage — optional metadata showing SUPERSEDES/CAUSES transitions. Use lineage ONLY to explain WHY state changed, never as a citation target. Cite content using [1], [2], etc.",
    schema: z.object({
        query: z.string().describe("The semantic search term derived from the user's prompt.")
    }),
    risk: "read-only",
    timeoutMs: 15_000,
    execute: async (input, context) => {
        if (!context.workspaceId) {
            return { success: false, error: "Missing workspace context." };
        }
        if (!context.userId) {
            return { success: false, error: "Missing user context." };
        }

        try {
            const { queryWorkspaceSources } = await import('@/lib/workspace/sources');
            const results = await queryWorkspaceSources({
                workspaceId: context.workspaceId,
                userId: context.userId,
                query: input.query,
                matchCount: 8,
                matchThreshold: 0.7,
            });

            if (!results.length) {
                return { success: true, data: "No relevant sources found in the Data Refinery for this query." };
            }

            const formatted = results
                .map((r, idx) => {
                    const title = r.title || r.origin_uri || `Source ${idx + 1}`;
                    const uri = r.origin_uri ? `\nURI: ${r.origin_uri}` : '';
                    const sim = typeof r.similarity === 'number' ? `\nSimilarity: ${(r.similarity * 100).toFixed(1)}%` : '';
                    
                    // Format lineage metadata (SUPERSEDES edges, causal transitions)
                    let lineageText = '';
                    if (r.lineage && r.lineage.length > 0) {
                        const transitions = r.lineage
                            .filter((l: any) => l.relationship === 'SUPERSEDES' || l.relationship === 'CAUSES')
                            .map((l: any) => `  - ${l.relationship}: ${l.content} (${(l.confidence * 100).toFixed(0)}% confidence)`)
                            .join('\n');
                        if (transitions) {
                            lineageText = `\nLineage:\n${transitions}`;
                        }
                    }
                    
                    return `[${idx + 1}] ${title}${uri}${sim}\n${r.content}${lineageText}`;
                })
                .join('\n\n---\n\n');

            return { success: true, data: formatted };
        } catch (e: any) {
            return { success: false, error: e?.message || 'workspace_source_query_failed' };
        }
    }
};
