// Pure availability contract used by Code Builder's owner-only Preview entry.
// Visibility is not authorization: the server always rechecks build ownership.
export interface PreviewAvailabilityInput {
  enabled: boolean;
  durableExecution: boolean;
  buildId: string | null;
  phase: 'idle' | 'planning' | 'coding' | 'done';
  hasFiles: boolean;
  hasError: boolean;
}
export interface PreviewAvailability {
  canLaunch: boolean;
  reason: string | null;
}

export function resolvePreviewAvailability(input: PreviewAvailabilityInput): PreviewAvailability {
  if (!input.enabled) {
    return {
      canLaunch: false,
      reason: 'Isolated Preview is in testing and is not enabled on this deployment. Public sharing remains disabled.',
    };
  }
  if (!input.durableExecution) {
    return {
      canLaunch: false,
      reason: 'Isolated Preview requires a durable Code Builder run. This session is using the legacy stream.',
    };
  }
  if (input.phase !== 'done') {
    return { canLaunch: false, reason: 'Finish building the app before opening its sandbox preview.' };
  }
  if (input.hasError) {
    return { canLaunch: false, reason: 'Resolve the build error before opening a sandbox preview.' };
  }
  if (!input.hasFiles || !input.buildId) {
    return { canLaunch: false, reason: 'No completed, saved build is available for an isolated preview.' };
  }
  return { canLaunch: true, reason: null };
}
