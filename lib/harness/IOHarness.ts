import type { ToolExecutionResult } from './types';
import { LocalIOHarness } from './LocalIOHarness';
import { GoIOHarness } from './GoIOHarness';
import { supabaseAdmin } from '@/lib/supabaseClient';

export interface IOHarness {
  initialize(): Promise<void>;
  readFile(filePath: string): Promise<ToolExecutionResult>;
  writeFile(filePath: string, content: string): Promise<ToolExecutionResult>;
  patchFile(filePath: string, searchBlock: string, replaceBlock: string): Promise<ToolExecutionResult>;
  executeCommandSecure(command: string, timeoutSeconds: number, workspaceId: string, userId: string): Promise<ToolExecutionResult>;
  discoverDocuments(targetPath: string, workspaceId: string, userId: string): Promise<ToolExecutionResult>;
  extractText(targetPath: string, workspaceId: string, userId: string): Promise<ToolExecutionResult>;
  summarizeRepo(targetPath: string, workspaceId: string, userId: string): Promise<ToolExecutionResult>;
  semanticSearch(query: string, workspaceId: string, userId: string): Promise<ToolExecutionResult>;
  ingestWorkspace(targetPath: string, workspaceId: string, userId: string): Promise<ToolExecutionResult>;
  insertEpisodicEvent(workspaceId: string, eventType: string, content: string, metadata: string, embedding: number[]): Promise<ToolExecutionResult>;
  searchEpisodicEvents(workspaceId: string, queryEmbedding: number[], topK: number): Promise<ToolExecutionResult>;
  shutdown?: () => void;
}

export interface HarnessConfig {
  env: 'local' | 'antigravity';
  workspaceRoot: string;
  antigravityEndpoint?: string;
  antigravityToken?: string;
  workspaceId?: string;
  userId?: string;
  traceId?: string;
}

export class HarnessFactory {
  public static async create(config: HarnessConfig): Promise<IOHarness> {
    if (config.env === 'antigravity') {
      throw new Error('Antigravity harness not yet implemented.');
    }

    const isLocalExecutionAllowed =
      process.env.LATTICE_ENABLE_LOCAL_HARNESS === 'true' ||
      !!process.env.LATTICE_HARNESS_BINARY_PATH;

    let selectedHarness: 'GoIOHarness' | 'LocalIOHarness' = 'LocalIOHarness';
    let selectionReason = 'default_web_fallback';

    if (config.env === 'local' && isLocalExecutionAllowed) {
      selectedHarness = 'GoIOHarness';
      selectionReason = process.env.LATTICE_HARNESS_BINARY_PATH
        ? 'explicit_binary_path'
        : 'local_execution_enabled';
    }

    const harness =
      selectedHarness === 'GoIOHarness'
        ? new GoIOHarness(config.workspaceRoot)
        : new LocalIOHarness(config.workspaceRoot);

    try {
      await harness.initialize();
    } catch (error: any) {
      if (selectedHarness === 'GoIOHarness') {
        const fallback = new LocalIOHarness(config.workspaceRoot);
        try {
          await fallback.initialize();
          void HarnessFactory.recordHarnessSelection({
            selectedHarness: 'LocalIOHarness',
            selectionReason: 'go_daemon_init_failed_fallback',
            workspaceId: config.workspaceId,
            userId: config.userId,
            traceId: config.traceId,
            workspaceRoot: config.workspaceRoot,
          });
          return fallback;
        } catch {
          throw error;
        }
      }
      throw error;
    }

    void HarnessFactory.recordHarnessSelection({
      selectedHarness,
      selectionReason,
      workspaceId: config.workspaceId,
      userId: config.userId,
      traceId: config.traceId,
      workspaceRoot: config.workspaceRoot,
    });

    return harness;
  }

  private static async recordHarnessSelection(params: {
    selectedHarness: 'GoIOHarness' | 'LocalIOHarness';
    selectionReason: string;
    workspaceId?: string;
    userId?: string;
    traceId?: string;
    workspaceRoot: string;
  }): Promise<void> {
    try {
      if (!supabaseAdmin) return;
      const payload: any = {
        event_type: 'harness_selection',
        operation_type: params.selectedHarness,
        path_accessed: params.workspaceRoot,
        success: true,
        duration_ms: 0,
        metadata: {
          selection_reason: params.selectionReason,
          selected_harness: params.selectedHarness,
        },
      };
      if (params.workspaceId) payload.workspace_id = params.workspaceId;
      if (params.userId) payload.user_id = params.userId;
      if (params.traceId) payload.metadata.trace_id = params.traceId;

      void supabaseAdmin
        .from('harness_telemetry_events')
        .insert(payload);
    } catch {
      // Never fail factory creation due to telemetry backend issues.
    }
  }
}
