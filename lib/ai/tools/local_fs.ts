import { tool } from 'ai';
import { z } from 'zod';
import { executeLocalDaemonTool } from './harness_bridge';

/**
 * Factory function to instantiate the local capability tools with trusted context.
 * The Next.js AI SDK handler must inject the authenticated WorkspaceID, UserID, 
 * and AuthToken before passing these tools to the model.
 */
export const createLocalFsTools = (workspaceId: string, userId: string, authToken: string) => ({
  
  list_directory: tool({
    description: "List the contents of a local directory. ALWAYS use this to inspect a directory before attempting to read or mutate files within it. Ensure the path exists and you are operating in the correct location. You must be authorized to access the root path.",
    parameters: z.object({
      path: z.string().describe("The absolute path of the directory to list.")
    }),
    execute: async ({ path }) => {
      const result = await executeLocalDaemonTool('list_directory_secure', { path }, workspaceId, userId, authToken);
      if (result.error) return result.error; // Explicitly returning the 403 denial string to the LLM
      return result;
    }
  }),

  read_file: tool({
    description: "Read the contents of a local file. The path must be within an authorized read-only or mutable root.",
    parameters: z.object({
      path: z.string().describe("The absolute path of the file to read.")
    }),
    execute: async ({ path }) => {
      const result = await executeLocalDaemonTool('read_file_secure', { path }, workspaceId, userId, authToken);
      if (result.error) return result.error;
      return result;
    }
  }),

  stat_path: tool({
    description: "Get metadata for a file or directory (size, mode, isDir). Use this to verify a path's existence or type before acting on it.",
    parameters: z.object({
      path: z.string().describe("The absolute path to stat.")
    }),
    execute: async ({ path }) => {
      const result = await executeLocalDaemonTool('stat_path_secure', { path }, workspaceId, userId, authToken);
      if (result.error) return result.error;
      return result;
    }
  }),

  create_file: tool({
    description: "Create a new empty file. Path must reside within an authorized MUTABLE root. Do NOT use this on read-only roots. If it fails with a 403 or containment error, you are outside your authorized scope and must correct the path.",
    parameters: z.object({
      path: z.string().describe("The absolute path of the new file to create.")
    }),
    execute: async ({ path }) => {
      const result = await executeLocalDaemonTool('create_file_secure', { path }, workspaceId, userId, authToken);
      if (result.error) return result.error;
      return result;
    }
  }),

  write_file: tool({
    description: "Write content to a file, completely overwriting the existing content. The path must reside within an authorized MUTABLE root. If you receive a 'Mutation Denied' error, you must STOP and ask the user to grant read/write access to this path via the UI.",
    parameters: z.object({
      path: z.string().describe("The absolute path of the file to write."),
      content: z.string().describe("The full string content to write to the file.")
    }),
    execute: async ({ path, content }) => {
      const result = await executeLocalDaemonTool('write_file_secure', { path, content }, workspaceId, userId, authToken);
      if (result.error) return result.error;
      return result;
    }
  }),

  create_directory: tool({
    description: "Create a new directory (and any necessary parent directories). Path must reside within an authorized MUTABLE root.",
    parameters: z.object({
      path: z.string().describe("The absolute path of the new directory.")
    }),
    execute: async ({ path }) => {
      const result = await executeLocalDaemonTool('create_directory_secure', { path }, workspaceId, userId, authToken);
      if (result.error) return result.error;
      return result;
    }
  }),

  move_path: tool({
    description: "Move or rename a file or directory. BOTH the source and destination paths must reside within authorized MUTABLE roots. Moving across different mounted drives is supported via fallback.",
    parameters: z.object({
      src_path: z.string().describe("The absolute path of the source to move."),
      dest_path: z.string().describe("The absolute destination path.")
    }),
    execute: async ({ src_path, dest_path }) => {
      // Must map to generic parameters in harness_bridge, handled natively
      const result = await executeLocalDaemonTool('move_path_secure', { src_path, dest_path }, workspaceId, userId, authToken);
      if (result.error) return result.error;
      return result;
    }
  }),

  delete_path: tool({
    description: "Delete a file or directory. WARNING: This is a highly destructive operation. The path must reside within a root that EXPLICITLY has the AllowDestructive flag enabled by the user. If this fails with a 403, stop and ask the user to explicitly enable 'Allow Delete' in the UI.",
    parameters: z.object({
      path: z.string().describe("The absolute path to delete.")
    }),
    execute: async ({ path }) => {
      const result = await executeLocalDaemonTool('delete_path_secure', { path }, workspaceId, userId, authToken);
      if (result.error) return result.error;
      return result;
    }
  }),

});
