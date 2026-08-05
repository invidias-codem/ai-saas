// lib/ucol/runtime/durableEngine.ts
// Phase 3 scaffold: durable orchestration runtime persisted to Supabase.
//
// Create tables in Supabase SQL editor:
//
// create table if not exists ucol_workflows (
//   id             text primary key,
//   status         text not null default 'pending',
//   current_step   text not null,
//   payload        jsonb not null default '{}'::jsonb,
//   idempotency_key text not null unique,
//   error_state    text,
//   created_at     timestamptz not null default now(),
//   updated_at     timestamptz not null default now()
// );

import { randomUUID } from 'crypto';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { UcolSpan } from '../observability/span';

function assertSupabase() {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client is not configured');
  }
}

function sb() {
  assertSupabase();
  return supabaseAdmin!;
}

export type WorkflowStatus = 'pending' | 'running' | 'paused' | 'completed' | 'failed';

export interface WorkflowContext {
  workflowId: string;
  stepName: string;
  payload: Record<string, any>;
  idempotencyKey: string;
}

export interface WorkflowRecord {
  id: string;
  status: WorkflowStatus;
  current_step: string;
  payload: Record<string, any>;
  idempotency_key: string;
  error_state?: string | null;
  created_at: string;
  updated_at: string;
}

export class DurableEngine {
  private readonly maxRetries = 3;

  public async startWorkflow(
    stepName: string,
    payload: Record<string, any>,
    idempotencyKey?: string
  ): Promise<WorkflowContext> {
    const key = idempotencyKey || randomUUID();
    const workflowId = randomUUID();

    const { data, error } = await sb()
      .from('ucol_workflows')
      .upsert(
        {
          id: workflowId,
          status: 'pending',
          current_step: stepName,
          payload,
          idempotency_key: key,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'idempotency_key', ignoreDuplicates: false }
      )
      .select()
      .single();

    if (error || !data) {
      throw new Error(`Failed to initialize workflow: ${error?.message || 'No data returned from database'}`);
    }

    return {
      workflowId: data.id,
      stepName: data.current_step,
      payload: data.payload,
      idempotencyKey: data.idempotency_key,
    };
  }

  public async executeStep<T>(
    context: WorkflowContext,
    stepFunction: (ctx: WorkflowContext) => Promise<T>
  ): Promise<T> {
    const span = new UcolSpan({
      name: `workflow:step:${context.stepName}`,
      metadata: { workflowId: context.workflowId, idempotencyKey: context.idempotencyKey }
    });

    let attempt = 0;

    await this.updateStatus(context.workflowId, 'running', context.stepName);

    while (attempt < this.maxRetries) {
      try {
        const result = await stepFunction(context);

        span.end({ output: result });
        await this.updateStatus(context.workflowId, 'completed', context.stepName);

        return result;
      } catch (error: any) {
        attempt++;
        span.addEvent('step:retry', { attempt, error: error.message });

        if (attempt >= this.maxRetries) {
          span.fail(error);
          await this.moveToDLQ(context.workflowId, error);
          throw new Error(`Workflow step ${context.stepName} failed after ${this.maxRetries} attempts.`);
        }

        await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
      }
    }

    throw new Error('Unreachable state');
  }

  public async resume(workflowId: string, stepName: string, stepFunction: (ctx: WorkflowContext) => Promise<any>): Promise<any> {
    const workflow = await this.loadWorkflow(workflowId);
    if (!workflow) throw new Error(`Workflow ${workflowId} not found`);

    const context: WorkflowContext = {
      workflowId,
      stepName: workflow.current_step,
      payload: workflow.payload,
      idempotencyKey: workflow.idempotency_key,
    };

    return this.executeStep(context, stepFunction);
  }

  private async updateStatus(workflowId: string, status: WorkflowStatus, step: string) {
    const { error } = await sb()
      .from('ucol_workflows')
      .update({ status, current_step: step, updated_at: new Date().toISOString() })
      .eq('id', workflowId);

    if (error) {
      console.error(`[DurableEngine] State transition failed for ${workflowId}:`, error);
    }
  }

  private async moveToDLQ(workflowId: string, error: Error) {
    await sb()
      .from('ucol_workflows')
      .update({
        status: 'failed',
        error_state: error.message,
        updated_at: new Date().toISOString()
      })
      .eq('id', workflowId);
  }

  public async loadWorkflow(workflowId: string): Promise<WorkflowRecord | null> {
    const { data, error } = await sb()
      .from('ucol_workflows')
      .select('*')
      .eq('id', workflowId)
      .maybeSingle();

    if (error) throw new Error(`loadWorkflow failed: ${error.message}`);
    return data as WorkflowRecord | null;
  }
}

export const durableEngine = new DurableEngine();
