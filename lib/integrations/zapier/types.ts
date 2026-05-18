export type ZapierMemoryMode = 'none' | 'store' | 'retrieve' | 'store_and_retrieve';
export type ZapierMemoryScope = 'conversation' | 'workspace';
export type ZapierImportance = 'low' | 'normal' | 'high';
export type ZapierRoutingMode = 'default' | 'fast' | 'quality' | 'extraction' | 'reasoning';
export type ZapierSensitivity = 'low' | 'normal' | 'high';
export type ZapierMemoryType = 'fact' | 'conversation_summary' | 'preference';

export interface ZapierTrace {
  requestId: string;
  timestamp: string;
}

export interface ZapierSuccessResponse<TResult = Record<string, unknown>> {
  success: true;
  operation: string;
  workspaceId: string;
  trace: ZapierTrace;
  result: TResult;
  warnings: string[];
}

export interface ZapierErrorResponse {
  success: false;
  operation: string;
  workspaceId: string | null;
  trace: ZapierTrace;
  error: {
    code: string;
    message: string;
    retryable: boolean;
  };
  warnings: string[];
}

export type ZapierResponse<TResult = Record<string, unknown>> =
  | ZapierSuccessResponse<TResult>
  | ZapierErrorResponse;
