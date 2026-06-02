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
