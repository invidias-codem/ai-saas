import * as path from 'path';
import * as os from 'os';
import type { CommandShell } from './commandShell';
import { NativeDaemonClient } from './nativeDaemonClient';
import type { IOHarness } from './IOHarness';
import type { ToolExecutionResult } from './types';

/** Typed operations over a managed, authenticated native daemon session. */
export class GoIOHarness implements IOHarness {
  private readonly workspaceRoot: string;
  private readonly daemon: NativeDaemonClient;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
    this.daemon = new NativeDaemonClient(this.workspaceRoot);
  }

  public initialize(): Promise<void> {
    const suffix = os.platform() === 'win32' ? '.exe' : '';
    const binaryName = `lattice-harness${suffix}`;

    const platformSuffix = os.platform() === 'win32' ? '.exe' : os.platform() === 'darwin' ? '-darwin' : '';
    const platformBinaryName = `lattice-harness${platformSuffix}`;

    const pathsToTry = [
      process.env.LATTICE_HARNESS_BINARY_PATH,
      path.resolve(process.cwd(), `go-harness/bin/${binaryName}`),
      path.resolve(__dirname, `../../go-harness/bin/${binaryName}`),
      path.resolve(__dirname, `../go-harness/bin/${binaryName}`),
      path.resolve(__dirname, `../../../standalone/go-harness/bin/${binaryName}`),
      path.resolve(process.cwd(), `go-harness/bin/${platformBinaryName}`),
      path.resolve(__dirname, `../../go-harness/bin/${platformBinaryName}`),
      path.resolve(__dirname, `../go-harness/bin/${platformBinaryName}`),
      path.resolve(__dirname, `../../../standalone/go-harness/bin/${platformBinaryName}`),
    ].filter((p): p is string => typeof p === 'string' && p.length > 0);

    return this.daemon.initialize(pathsToTry);
  }

  private sendRequest(action: string, inputs: Record<string, unknown>): Promise<ToolExecutionResult> {
    return this.daemon.request(action, inputs);
  }

  public async readFile(filePath: string): Promise<ToolExecutionResult> {
    return this.sendRequest('read_file', { filePath });
  }

  public async writeFile(filePath: string, content: string): Promise<ToolExecutionResult> {
    return this.sendRequest('write_file', { filePath, content });
  }

  public async patchFile(filePath: string, searchBlock: string, replaceBlock: string): Promise<ToolExecutionResult> {
    return this.sendRequest('patch_file', { filePath, search_block: searchBlock, replace_block: replaceBlock });
  }

  public async executeCommandSecure(command: string, timeoutSeconds: number, workspaceId: string, userId: string, shell?: CommandShell): Promise<ToolExecutionResult> {
    return this.sendRequest('execute_command_secure', { 
      command,
      shell,
      timeout_seconds: timeoutSeconds, 
      path: this.workspaceRoot,
      workspace_id: workspaceId, 
      user_id: userId 
    });
  }

  public async discoverDocuments(targetPath: string, workspaceId: string, userId: string): Promise<ToolExecutionResult> {
    return this.sendRequest('discover_documents_secure', { path: targetPath, workspace_id: workspaceId, user_id: userId });
  }

  public async extractText(targetPath: string, workspaceId: string, userId: string): Promise<ToolExecutionResult> {
    return this.sendRequest('extract_text_secure', { path: targetPath, workspace_id: workspaceId, user_id: userId });
  }

  public async summarizeRepo(targetPath: string, workspaceId: string, userId: string): Promise<ToolExecutionResult> {
    return this.sendRequest('summarize_repo_secure', { path: targetPath, workspace_id: workspaceId, user_id: userId });
  }

  public async semanticSearch(query: string, workspaceId: string, userId: string): Promise<ToolExecutionResult> {
    return this.sendRequest('semantic_search_secure', { query: query, workspace_id: workspaceId, user_id: userId });
  }

  public async ingestWorkspace(targetPath: string, workspaceId: string, userId: string): Promise<ToolExecutionResult> {
    const apiBaseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
    const authToken = process.env.LATTICE_AUTH_TOKEN || '';
    
    return this.sendRequest('start_workspace_ingestion', { 
      path: targetPath, 
      workspace_id: workspaceId, 
      user_id: userId,
      api_base_url: apiBaseUrl,
      auth_token: authToken
    });
  }

  public async insertEpisodicEvent(workspaceId: string, eventType: string, content: string, metadata: string, embedding: number[]): Promise<ToolExecutionResult> {
    return this.sendRequest('insert_episodic_event', {
      workspace_id: workspaceId,
      event_type: eventType,
      content,
      metadata,
      embedding
    });
  }

  public async searchEpisodicEvents(workspaceId: string, queryEmbedding: number[], topK: number): Promise<ToolExecutionResult> {
    return this.sendRequest('search_episodic_events', {
      workspace_id: workspaceId,
      query_embedding: queryEmbedding,
      top_k: topK
    });
  }

  public shutdown(): Promise<void> {
    return this.daemon.shutdown();
  }
}
