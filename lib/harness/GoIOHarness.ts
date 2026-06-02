import * as path from 'path';
import * as fs from 'fs/promises';
import * as os from 'os';
import { spawn, ChildProcess } from 'child_process';
import type { IOHarness } from './IOHarness';
import type { ToolExecutionResult } from './types';

/**
 * A TypeScript IOHarness implementation that acts as an IPC client
 * to the compiled Go binary execution daemon (`go-harness/bin/lattice-harness`).
 */
export class GoIOHarness implements IOHarness {
  private workspaceRoot: string;
  private binaryPath: string = '';
  
  private child: ChildProcess | null = null;
  private pendingRequests: Map<string, (res: ToolExecutionResult) => void> = new Map();
  private stdoutBuffer: string = '';
  private requestIdCounter: number = 0;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  public async initialize(): Promise<void> {
    // Cross-Platform Suffix Resolution: Check if on Windows
    const suffix = os.platform() === 'win32' ? '.exe' : '';
    const binaryName = `lattice-harness${suffix}`;

    // Dynamic Binary Lookup checking multiple paths
    const pathsToTry = [
      process.env.LATTICE_HARNESS_BINARY_PATH,
      path.resolve(process.cwd(), `go-harness/bin/${binaryName}`),
      path.resolve(__dirname, `../../go-harness/bin/${binaryName}`),
      path.resolve(__dirname, `../go-harness/bin/${binaryName}`),
    ].filter((p): p is string => typeof p === 'string' && p.length > 0);

    let found = false;
    for (const p of pathsToTry) {
      try {
        await fs.access(p, fs.constants.X_OK);
        this.binaryPath = p;
        found = true;
        break;
      } catch {
        // Path inaccessible or not executable; try next option
      }
    }

    if (!found) {
      throw new Error(
        `Go harness execution binary not found or not executable. Checked paths: ${pathsToTry.join(
          ', '
        )}. Please make sure it is compiled inside go-harness first.`
      );
    }

    // Spawn the persistent daemon
    this.child = spawn(this.binaryPath, [], {
      cwd: this.workspaceRoot,
      env: process.env,
      stdio: ['pipe', 'pipe', 'pipe']
    });

    this.child.stderr?.on('data', (chunk: Buffer) => {
      // Diagnostic traces routed to stderr
      process.stderr.write(`[Go Daemon Debug] ${chunk.toString('utf-8')}`);
    });

    this.child.stdout?.on('data', (chunk: Buffer) => {
      this.stdoutBuffer += chunk.toString('utf-8');
      
      let newlineIdx: number;
      while ((newlineIdx = this.stdoutBuffer.indexOf('\n')) !== -1) {
        // Extract line and remove \r to prevent Windows CRLF issues
        const line = this.stdoutBuffer.substring(0, newlineIdx).trim();
        this.stdoutBuffer = this.stdoutBuffer.substring(newlineIdx + 1);
        
        if (line) {
          this.handleDaemonResponse(line);
        }
      }
    });

    this.child.on('error', (err) => {
      console.error(`[Lattice OS] Failed to spawn Go harness execution bridge: ${err.message}`);
      this.cleanupPending(null);
    });

    this.child.on('close', (code) => {
      if (code !== 0 && code !== null) {
        console.warn(`[Lattice OS] Go Harness Daemon closed unexpectedly with exit code: ${code}`);
      }
      this.cleanupPending(code);
    });
  }

  private handleDaemonResponse(line: string) {
    try {
      const response = JSON.parse(line);
      const callback = this.pendingRequests.get(response.id);
      
      if (callback) {
        this.pendingRequests.delete(response.id);
        if (response.error) {
          callback({ ok: false, error: response.error.message, code: 'DAEMON_RPC_ERROR' });
        } else {
          callback(response.result);
        }
      }
    } catch (err: any) {
      console.error(`[Lattice OS] Failed to decode JSON-RPC frame line: ${err.message}. Line: ${line}`);
    }
  }

  private sendRequest(action: string, inputs: any): Promise<ToolExecutionResult> {
    return new Promise((resolve) => {
      if (!this.child || this.child.killed || !this.child.stdin?.writable) {
        return resolve({ ok: false, error: 'Harness daemon process is dead or uninitialized', code: 'DAEMON_DOWN' });
      }

      const id = `req_${++this.requestIdCounter}_${Date.now()}`;
      this.pendingRequests.set(id, resolve);

      const payload = {
        id,
        jsonrpc: "2.0",
        workspaceRoot: this.workspaceRoot,
        action,
        inputs
      };

      this.child.stdin.write(JSON.stringify(payload) + '\n');
    });
  }

  private cleanupPending(exitCode: number | null) {
    for (const [id, resolve] of this.pendingRequests.entries()) {
      resolve({
        ok: false,
        error: `Harness daemon terminated with exit status: ${exitCode}. Call aborted.`,
        code: 'DAEMON_CRASH'
      });
    }
    this.pendingRequests.clear();
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

  public async executeCommandSecure(command: string, timeoutSeconds: number, workspaceId: string, userId: string): Promise<ToolExecutionResult> {
    return this.sendRequest('execute_command_secure', { 
      command, 
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

  public shutdown() {
    if (this.child && !this.child.killed) {
      this.child.kill('SIGTERM');
    }
  }
}
