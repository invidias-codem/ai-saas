import { randomUUID } from 'crypto';
import type { ZapierErrorResponse, ZapierSuccessResponse, ZapierTrace } from './types';

export function createZapierTrace(requestId?: string): ZapierTrace {
  return {
    requestId: requestId || randomUUID(),
    timestamp: new Date().toISOString(),
  };
}

export function createZapierSuccessResponse<TResult extends Record<string, unknown>>({
  operation,
  workspaceId,
  result,
  warnings = [],
  requestId,
}: {
  operation: string;
  workspaceId: string;
  result: TResult;
  warnings?: string[];
  requestId?: string;
}): ZapierSuccessResponse<TResult> {
  return {
    success: true,
    operation,
    workspaceId,
    trace: createZapierTrace(requestId),
    result,
    warnings,
  };
}

export function createZapierErrorResponse({
  operation,
  workspaceId = null,
  code,
  message,
  retryable = false,
  warnings = [],
  requestId,
}: {
  operation: string;
  workspaceId?: string | null;
  code: string;
  message: string;
  retryable?: boolean;
  warnings?: string[];
  requestId?: string;
}): ZapierErrorResponse {
  return {
    success: false,
    operation,
    workspaceId,
    trace: createZapierTrace(requestId),
    error: {
      code,
      message,
      retryable,
    },
    warnings,
  };
}
