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
//  - Interval interval misses are tracked in a Ref to avoid extra renders.

import { useState, useEffect, useRef } from 'react';

// Tauri native client check (fails gracefully in a standard browser)
const isTauri =
  typeof window !== 'undefined' &&
  ('__TAURI_INTERNALS__' in window || '__TAURI_IPC__' in window);

export interface HarnessEvent {
  id: string;
  timestamp: string;
  type: 'read' | 'execution' | 'heartbeat' | 'sync';
  description: string;
  payload?: any;
}

export interface HarnessState {
  isDaemonRunning: boolean;
  lastHeartbeat: Date | null;
  auditLogs: HarnessEvent[];
  appFocused: boolean;
}

export function useHarnessHeartbeat(): HarnessState {
  const [isDaemonRunning, setIsDaemonRunning] = useState(false);
  const [lastHeartbeat, setLastHeartbeat] = useState<Date | null>(null);
  const [auditLogs, setAuditLogs] = useState<HarnessEvent[]>([]);
  const [appFocused, setAppFocused] = useState(true);

  const missedPingsRef = useRef(0);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const appFocusedRef = useRef(true);

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

    const pingDaemon = async () => {
      // Don't burn IPC calls while the window is backgrounded.
      if (!appFocusedRef.current) {
        missedPingsRef.current = 0;
        return;
      }
     
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const result: any = await invoke('ping_daemon').catch(() => null);

        if (result === 'ok' || result?.status === 'ok') {
          missedPingsRef.current = 0;
          setIsDaemonRunning(true);
          setLastHeartbeat(new Date());

          if (result?.recent_events && Array.isArray(result.recent_events)) {
            setAuditLogs(prev => {
              const incoming = result.recent_events as HarnessEvent[];
              const seen = new Set(incoming.map(e => e.id));
              return [...incoming, ...prev.filter(e => !seen.has(e.id))].slice(0, 50);
            });
          }
        } else if (result?.status === 'booting') {
          // Sidecar spawned but not ready; treat as a miss but keep pinging.
          missedPingsRef.current++;
        } else {
          missedPingsRef.current++;
        }
      } catch {
        missedPingsRef.current++;
      }

      // Sliding-window debounce: require 3 consecutive misses before disconnecting.
      if (missedPingsRef.current > 2) {
        setIsDaemonRunning(false);
      }
    };

    pingDaemon();
    intervalRef.current = setInterval(pingDaemon, 3000);

    // Window lifecycle listeners (background throttle / teardown).
    let unlistenWindow: (() => void) | undefined;
    (async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const win = getCurrentWindow();
        const unlistenFocus = await win.onFocusChanged(({ payload: focused }) => {
          setAppFocused(focused);
        });
        const unlistenClose = await win.onCloseRequested(event => {
          missedPingsRef.current = 0;
          setIsDaemonRunning(false);
          event.preventDefault();
          win.close();
        });
        unlistenWindow = () => {
          unlistenFocus();
          unlistenClose();
        };
      } catch (err) {
        console.warn('[useHarnessHeartbeat] Window lifecycle listeners unavailable:', err);
      }
    })();

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      unlistenWindow?.();
    };
    // Alive-loop: all mutable reads flow through refs; empty deps are
    // intentional so the IPC interval never thrashes on state change.
  }, []);

  return { isDaemonRunning, lastHeartbeat, auditLogs, appFocused };
}
