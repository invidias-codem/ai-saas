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
  private daemonPort: number | null = null;
  private requestIdCounter: number = 0;

  constructor(workspaceRoot: string) {
    this.workspaceRoot = path.resolve(workspaceRoot);
  }

  public async initialize(): Promise<void> {
    const suffix = os.platform() === 'win32' ? '.exe' : '';
    const binaryName = `lattice-harness${suffix}`;

    const pathsToTry = [
      process.env.LATTICE_HARNESS_BINARY_PATH,
      path.resolve(process.cwd(), `go-harness/bin/${binaryName}`),
      path.resolve(__dirname, `../../go-harness/bin/${binaryName}`),
      path.resolve(__dirname, `../go-harness/bin/${binaryName}`),
      path.resolve(__dirname, `../../../standalone/go-harness/bin/${binaryName}`),
    ].filter((p): p is string => typeof p === 'string' && p.length > 0);

    let found = false;
    for (const p of pathsToTry) {
      try {
        await fs.access(p, fs.constants.X_OK);
        this.binaryPath = p;
        found = true;
        break;
      } catch {
      }
    }

    if (!found) {
      throw new Error(`Go harness execution binary not found or not executable. Checked paths: ${pathsToTry.join(', ')}`);
    }

    return new Promise((resolve, reject) => {
      this.child = spawn(this.binaryPath, ['--port=0'], {
        cwd: this.workspaceRoot,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      this.child.stderr?.on('data', (chunk: Buffer) => {
        process.stderr.write(`[Go Daemon Debug] ${chunk.toString('utf-8')}`);
      });

      let stdoutBuffer = '';
      let portFound = false;

      this.child.stdout?.on('data', (chunk: Buffer) => {
        if (portFound) return;
        stdoutBuffer += chunk.toString('utf-8');
        let newlineIdx = stdoutBuffer.indexOf('\n');
        if (newlineIdx !== -1) {
          const line = stdoutBuffer.substring(0, newlineIdx).trim();
          try {
            const data = JSON.parse(line);
            if (data.status === 'ready' && data.port) {
              this.daemonPort = data.port;
              portFound = true;
              resolve();
            }
          } catch (e) {
            console.error('[Lattice OS] Failed to parse daemon boot line:', line);
          }
        }
      });

      this.child.on('error', (err) => {
        console.error(`[Lattice OS] Failed to spawn Go harness execution bridge: ${err.message}`);
        reject(err);
      });

      this.child.on('close', (code) => {
        if (code !== 0 && code !== null) {
          console.warn(`[Lattice OS] Go Harness Daemon closed unexpectedly with exit code: ${code}`);
        }
        this.daemonPort = null;
      });
      
      // Safety timeout
      setTimeout(() => {
        if (!portFound) {
          reject(new Error('Timed out waiting for Go daemon to bind port.'));
        }
      }, 5000);
    });
  }


  private async sendRequest(action: string, inputs: any): Promise<ToolExecutionResult> {
    if (!this.daemonPort) {
      return { ok: false, error: 'Harness daemon process is dead or uninitialized', code: 'DAEMON_DOWN' };
    }

    const id = `req_${++this.requestIdCounter}_${Date.now()}`;
    const payload = {
      id,
      jsonrpc: "2.0",
      workspaceRoot: this.workspaceRoot,
      action,
      inputs
    };

    try {
      const res = await fetch(`http://127.0.0.1:${this.daemonPort}/rpc`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      if (!res.ok) {
        return { ok: false, error: `HTTP ${res.status} from daemon`, code: 'DAEMON_HTTP_ERROR' };
      }
      
      const jsonRes = await res.json();
      if (jsonRes.error) {
        return { ok: false, error: jsonRes.error.message, code: 'DAEMON_RPC_ERROR' };
      }
      return jsonRes.result;
    } catch (err: any) {
      return { ok: false, error: err.message, code: 'DAEMON_NETWORK_ERROR' };
    }
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
