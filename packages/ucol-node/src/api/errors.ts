/**
 * @file api/errors.ts
 * @description UCOL JSON-RPC error codes (-33001 to -33008) per spec Appendix A.16.
 */

/** Standard JSON-RPC 2.0 error codes */
export const JSON_RPC_ERRORS = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
} as const;

/** UCOL-specific error codes */
export const UCOL_ERRORS = {
  /** Agent's security_clearance below required tier */
  INSUFFICIENT_CLEARANCE: -33001,
  /** allow_destructive=false but destructive intent detected */
  DESTRUCTIVE_REQUIRES_APPROVAL: -33002,
  /** Context slice cannot fit within budget_tokens */
  BUDGET_EXCEEDED: -33003,
  /** Routing exceeded max_latency_ms */
  ROUTING_TIMEOUT: -33004,
  /** Doubt Engine security_score < 4.0 */
  HUMAN_REVIEW_REQUIRED: -33005,
  /** Target node is in DRAINING or SHUTDOWN state */
  NODE_UNAVAILABLE: -33006,
  /** Client MAJOR version incompatible with node */
  VERSION_MISMATCH: -33007,
  /** Session TTL exceeded; call ucol.session.open again */
  SESSION_EXPIRED: -33008,
} as const;

export type UCOLErrorCode = (typeof UCOL_ERRORS)[keyof typeof UCOL_ERRORS];
export type JSONRPCErrorCode = (typeof JSON_RPC_ERRORS)[keyof typeof JSON_RPC_ERRORS];

/** Human-readable error messages for UCOL codes */
export const UCOL_ERROR_MESSAGES: Record<UCOLErrorCode, string> = {
  [-33001]: 'Insufficient security clearance for this operation',
  [-33002]: 'Destructive action requires explicit approval (allow_destructive=true)',
  [-33003]: 'Context slice exceeds token budget',
  [-33004]: 'Routing operation timed out',
  [-33005]: 'Human review required (security score below threshold)',
  [-33006]: 'Node is unavailable (draining or shutdown)',
  [-33007]: 'Protocol version mismatch',
  [-33008]: 'Session expired — open a new session',
};

/** JSON-RPC error object shape */
export interface RPCError {
  code: number;
  message: string;
  data?: unknown;
}

/**
 * Create a UCOL error object for a JSON-RPC error response.
 *
 * @param code - UCOL or standard JSON-RPC error code
 * @param data - Optional additional context
 * @returns RPCError object
 */
export function makeError(code: number, data?: unknown): RPCError {
  const message =
    UCOL_ERROR_MESSAGES[code as UCOLErrorCode] ??
    getStandardMessage(code) ??
    'Unknown error';

  return { code, message, data };
}

function getStandardMessage(code: number): string | null {
  switch (code) {
    case -32700:
      return 'Parse error';
    case -32600:
      return 'Invalid request';
    case -32601:
      return 'Method not found';
    case -32602:
      return 'Invalid params';
    case -32603:
      return 'Internal error';
    default:
      return null;
  }
}

/**
 * UCOLError — thrown by internal methods for structured error propagation.
 */
export class UCOLError extends Error {
  readonly code: number;
  readonly data?: unknown;

  constructor(code: number, message?: string, data?: unknown) {
    const defaultMsg = UCOL_ERROR_MESSAGES[code as UCOLErrorCode] ?? 'UCOL error';
    super(message ?? defaultMsg);
    this.code = code;
    this.data = data;
    this.name = 'UCOLError';
  }
}
