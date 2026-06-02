import type { ToolExecutionResult } from './types';
import { LocalIOHarness } from './LocalIOHarness';
import { GoIOHarness } from './GoIOHarness';

/**
 * The IOHarness is the abstract execution boundary for all tool actions.
 * 
 * The model should not know whether it is interacting with a local file system,
 * a remote sandboxed container (Antigravity), or a VM. All tools are dispatched
 * through this interface.
 */
export interface IOHarness {
  /**
   * Initializes or verifies the harness environment.
   */
  initialize(): Promise<void>;

  /**
   * Reads a file at the given path.
   * Implementation must enforce workspace boundary checks.
   */
  readFile(filePath: string): Promise<ToolExecutionResult>;

  /**
   * Writes content to a file at the given path.
   * Implementation must enforce workspace boundary checks.
   */
  writeFile(filePath: string, content: string): Promise<ToolExecutionResult>;

  /**
   * Patches a file by replacing an exact search block with a replace block.
   */
  patchFile(filePath: string, searchBlock: string, replaceBlock: string): Promise<ToolExecutionResult>;

  /**
   * Executes a shell command securely within the harness environment.
   * Implementation enforces strict context timeouts, non-interactive execution, and output truncation.
   */
  executeCommandSecure(command: string, timeoutSeconds: number, workspaceId: string, userId: string): Promise<ToolExecutionResult>;

  /**
   * Discovers documents within the workspace, honoring exclusion lists.
   */
  discoverDocuments(targetPath: string, workspaceId: string, userId: string): Promise<ToolExecutionResult>;

  /**
   * Safely reads text/code files, enforcing size constraints and extensions.
   */
  extractText(targetPath: string, workspaceId: string, userId: string): Promise<ToolExecutionResult>;

  /**
   * Summarizes the repository structure and configuration.
   */
  summarizeRepo(targetPath: string, workspaceId: string, userId: string): Promise<ToolExecutionResult>;

  /**
   * Executes an in-memory cosine similarity search against local SQLite chunks.
   */
  semanticSearch(query: string, workspaceId: string, userId: string): Promise<ToolExecutionResult>;

  /**
   * Initiates an asynchronous background ingestion of the workspace into the local Vector DB.
   */
  ingestWorkspace(targetPath: string, workspaceId: string, userId: string): Promise<ToolExecutionResult>;

  /**
   * Inserts a new episodic event into the local SQLite ledger.
   */
  insertEpisodicEvent(workspaceId: string, eventType: string, content: string, metadata: string, embedding: number[]): Promise<ToolExecutionResult>;

  /**
   * Searches the episodic ledger using an embedded query.
   */
  searchEpisodicEvents(workspaceId: string, queryEmbedding: number[], topK: number): Promise<ToolExecutionResult>;

  /**
   * Optional shutdown to gracefully terminate the persistent harness process if it's stateful.
   */
  shutdown?: () => void;
}

export interface HarnessConfig {
  env: 'local' | 'antigravity';
  workspaceRoot: string;
  antigravityEndpoint?: string;
  antigravityToken?: string;
}

export class HarnessFactory {
  public static async create(config: HarnessConfig): Promise<IOHarness> {
    if (config.env === 'local') {
      const harness = new GoIOHarness(config.workspaceRoot);
      await harness.initialize();
      return harness;
    }
    if (config.env === 'antigravity') {
      throw new Error('Antigravity harness not yet implemented.');
    }
    throw new Error(`Unsupported harness environment: ${(config as any).env}`);
  }
}

