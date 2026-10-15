// Trigger SDK 4.5.16 public run statuses. Shared by relay and client so
// terminal detection cannot drift between the two observers.
const terminalStatuses = new Set([
  'COMPLETED', 'FAILED', 'CANCELED', 'CRASHED',
  'SYSTEM_FAILURE', 'EXPIRED', 'TIMED_OUT',
]);

export function isTerminalRunStatus(status: unknown): status is string {
  return typeof status === 'string' && terminalStatuses.has(status);
}

export function isSuccessfulRunStatus(status: string): boolean {
  return status === 'COMPLETED';
}
