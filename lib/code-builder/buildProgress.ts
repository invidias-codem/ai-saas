interface ProgressSnapshot {
  status: string;
  phase: string;
  progress: number;
  updatedAt?: string | null;
}

export interface ProgressObservation {
  marker: string;
  lastChangedAt: number;
  updatedAt?: string | null;
}

/** Successful polls measure connectivity; only durable changes measure progress. */
export function observeBuildProgress(
  previous: ProgressObservation | null,
  snapshot: ProgressSnapshot,
  now: number,
): ProgressObservation {
  const marker = JSON.stringify([snapshot.status, snapshot.phase, snapshot.progress, snapshot.updatedAt]);
  if (previous?.marker === marker) return previous;
  const persistedAt = Date.parse(snapshot.updatedAt ?? '');
  return {
    marker,
    updatedAt: snapshot.updatedAt,
    lastChangedAt: Number.isFinite(persistedAt) ? Math.min(now, persistedAt) : now,
  };
}
