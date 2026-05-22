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
   * Executes a shell command within the harness environment.
   * Implementation must enforce timeouts, output capping, and policy limits.
   */
  runCommand(command: string, timeoutMs?: number): Promise<ToolExecutionResult>;

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

