import { tool } from 'ai';
import { z } from 'zod';
import { executeLocalDaemonTool } from './harness_bridge';

/**
 * Factory function to instantiate Local Intelligence tools.
 * These tools allow the agent to safely discover and extract text files
 * strictly within the user's granted workspace roots.
 */
export const createLocalIntelligenceTools = (workspaceId: string, userId: string, authToken: string) => ({
  
  discover_documents: tool({
    description: "Recursively scan a directory for supported text and code files. Returns structured metadata (paths, sizes, extensions). Use this to find all editable or readable files within a specific folder.",
    parameters: z.object({
      path: z.string().describe("The absolute directory path to scan.")
    }),
    execute: async ({ path }) => {
      const result = await executeLocalDaemonTool('discover_documents_secure', { path }, workspaceId, userId, authToken);
      if (result.error) return result.error;
      
      // Parse the JSON string output returned by the daemon
      try {
        if (result.Output) return JSON.parse(result.Output);
      } catch (e) {
        return result;
      }
      return result;
    }
  }),

  extract_text: tool({
    description: "Read a local text or source code file up to 100KB in size. ONLY use this on individual files discovered via list_directory or discover_documents. Unsupported file types (like PDFs or images) and files larger than 100KB will be strictly rejected.",
    parameters: z.object({
      path: z.string().describe("The absolute path of the text file to read.")
    }),
    execute: async ({ path }) => {
      const result = await executeLocalDaemonTool('extract_text_secure', { path }, workspaceId, userId, authToken);
      if (result.error) return result.error;

      try {
        if (result.Output) return JSON.parse(result.Output);
      } catch (e) {
        return result;
      }
      return result;
    }
  }),

  summarize_repo: tool({
    description: "Scan a directory to generate a high-level summary of the repository structure (top-level folders, major configs like package.json, and file-type distribution). Use this FIRST when exploring a new codebase to get a map of the repository without wasting your context window.",
    parameters: z.object({
      path: z.string().describe("The absolute path of the repository root to summarize.")
    }),
    execute: async ({ path }) => {
      const result = await executeLocalDaemonTool('summarize_repo_secure', { path }, workspaceId, userId, authToken);
      if (result.error) return result.error;

      try {
        if (result.Output) return JSON.parse(result.Output);
      } catch (e) {
        return result;
      }
      return result;
    }
  }),

});
