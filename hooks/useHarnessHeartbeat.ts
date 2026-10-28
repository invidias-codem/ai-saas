// hooks/useHarnessHeartbeat.ts
//
// Hardened desktop heartbeat hook. Key invariants:
//  - ONE stable interval per mount: the interval ID lives in a Ref and is never
//    recreated when state flips. (The previous version recreated the interval on
//    every state change because isDaemonRunning/appFocused were in the deps.)
//  - Functional setState (setX(prev => ... )) so updates never hold stale
//    closures over live state.
//  - No sync setState in the mount effect: the Tauri branch is the only writer.
//    In a plain browser the hook stays permanently "disconnected" by default.
//  - Heartbeat misses are tracked in a Ref to avoid extra renders.

import { useState, useEffect, useRef, useCallback } from 'react';

// Tauri native client check (fails gracefully in a standard browser)
const isTauri =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI_IPC__' in window);

export interface HarnessEvent {
  id: string;
  timestamp: string;
  type: 'read' | 'execution' | 'heartbeat' | 'sync';
  description: string;
}

export interface HarnessState {
  isDaemonRunning: boolean;
  lastHeartbeat: Date | null;
  auditLogs: HarnessEvent[];
  appFocused: boolean;
  nativeError: string | null;
  isRestarting: boolean;
  canRestart: boolean;
  restartDaemon: () => Promise<void>;
}

interface NativeHeartbeat {
  status: 'ok' | 'booting' | 'error' | 'stopped' | 'stopping';
  recent_events?: HarnessEvent[];
  error?: { code: string; message: string };
}

export function useHarnessHeartbeat(): HarnessState {
  const [isDaemonRunning, setIsDaemonRunning] = useState(false);
  const [lastHeartbeat, setLastHeartbeat] = useState<Date | null>(null);
  const [auditLogs, setAuditLogs] = useState<HarnessEvent[]>([]);
  const [appFocused, setAppFocused] = useState(true);
  const [nativeError, setNativeError] = useState<string | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  const [nativeErrorCode, setNativeErrorCode] = useState<string | null>(null);

  const missedPingsRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const appFocusedRef = useRef(true);
  const generationRef = useRef(0);
  const restartingRef = useRef(false);
  const refreshRef = useRef<(() => Promise<void>) | null>(null);
  const mountedRef = useRef(false);

  const restartDaemon = useCallback(async () => {
    if (!isTauri || restartingRef.current || !mountedRef.current) return;
    restartingRef.current = true;
    generationRef.current++;
    setIsRestarting(true);
    setIsDaemonRunning(false);
    setNativeError(null);
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const result = await invoke<NativeHeartbeat>('restart_daemon');
      if (mountedRef.current && result.status !== 'ok') {
        setNativeErrorCode(result.error?.code ?? null);
        setNativeError(result.error?.message ?? 'The local service could not restart. Try again shortly.');
      }
    } catch {
      if (mountedRef.current) setNativeError('The local service could not restart. Try again shortly.');
    } finally {
      restartingRef.current = false;
      if (mountedRef.current) {
        setIsRestarting(false);
        await refreshRef.current?.();
      }
    }
  }, []);

  // Keep a live mirror of appFocused into a ref so the polling callback reads
  // the latest value regardless of when it was created. Written inside an
  // effect (render-phase ref writes are forbidden by react-hooks/refs).
  useEffect(() => {
    appFocusedRef.current = appFocused;
  }, [appFocused]);

  useEffect(() => {
    if (!isTauri) {
      // Browser mode: permanently disconnected — the default false state is the
      // correct surface and no setState is required.
      return;
    }

    let alive = true;
    mountedRef.current = true;
    const pingDaemon = async () => {
      // Don't burn IPC calls while the window is backgrounded.
      if (!appFocusedRef.current || restartingRef.current) {
        missedPingsRef.current = 0;
        return;
      }
      const generation = generationRef.current;
     
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        if (!alive || generation !== generationRef.current) return;
        const result = await invoke<NativeHeartbeat>('ping_daemon');
        if (!alive || generation !== generationRef.current) return;

        if (result.status === 'ok') {
          missedPingsRef.current = 0;
          setIsDaemonRunning(true);
          setNativeError(null);
          setNativeErrorCode(null);
          setLastHeartbeat(new Date());

          if (result?.recent_events && Array.isArray(result.recent_events)) {
            setAuditLogs(prev => {
              const incoming = result.recent_events as HarnessEvent[];
              const seen = new Set(incoming.map(e => e.id));
              return [...incoming, ...prev.filter(e => !seen.has(e.id))].slice(0, 50);
            });
          }
        } else if (result.status === 'error' || result.status === 'stopped') {
          missedPingsRef.current = 0;
          setIsDaemonRunning(false);
          setNativeErrorCode(result.error?.code ?? null);
          setNativeError(result.error?.message ?? 'The local service is unavailable. Restart Lattice OS to try again.');
        } else if (result.status === 'booting' || result.status === 'stopping') {
          // Rust bounds startup and reports its final error; keep connecting.
          missedPingsRef.current = 0;
          setIsDaemonRunning(false);
          setNativeError(null);
          setNativeErrorCode(null);
        } else {
          missedPingsRef.current++;
        }
      } catch {
        if (!alive || generation !== generationRef.current) return;
        missedPingsRef.current++;
      }

      // Sliding-window debounce: require 3 consecutive misses before disconnecting.
      if (missedPingsRef.current > 2) {
        setIsDaemonRunning(false);
        setNativeError('The local service is unavailable. Restart Lattice OS to try again.');
      }
    };

    refreshRef.current = pingDaemon;
    pingDaemon();
    intervalRef.current = setInterval(pingDaemon, 3000);

    // Window lifecycle listeners (background throttle / teardown).
    let unlistenWindow: (() => void) | undefined;
    (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        const unlistenFocus = await win.onFocusChanged(({ payload: focused }) => {
          if (alive) setAppFocused(focused);
        });
        if (alive) unlistenWindow = unlistenFocus;
        else unlistenFocus();
      } catch (err) {
        console.warn('[useHarnessHeartbeat] Window lifecycle listeners unavailable:', err);
      }
    })();

    return () => {
      alive = false;
      mountedRef.current = false;
      refreshRef.current = null;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      unlistenWindow?.();
    };
    // Alive-loop: all mutable reads flow through refs; empty deps are
    // intentional so the IPC interval never thrashes on state change.
  }, []);

  return { isDaemonRunning, lastHeartbeat, auditLogs, appFocused, nativeError, isRestarting, restartDaemon,
    canRestart: isTauri && nativeErrorCode !== 'LOCAL_CLEANUP_UNCONFIRMED' };
}
