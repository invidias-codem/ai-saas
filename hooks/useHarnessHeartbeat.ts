import { useState, useEffect, useRef } from 'react';

// Tauri native client check (fails gracefully in a standard browser)
const isTauri = typeof window !== 'undefined' && ('__TAURI_INTERNALS__' in window || '__TAURI_IPC__' in window);

export interface HarnessEvent {
  id: string;
  timestamp: string;
  type: 'read' | 'execution' | 'heartbeat' | 'sync';
  description: string;
  payload?: any;
}

export function useHarnessHeartbeat() {
  const [isDaemonRunning, setIsDaemonRunning] = useState<boolean>(false);
  const [lastHeartbeat, setLastHeartbeat] = useState<Date | null>(null);
  const [auditLogs, setAuditLogs] = useState<HarnessEvent[]>([]);
  const missedPings = useRef(0);

  useEffect(() => {
    if (!isTauri) {
      setIsDaemonRunning(false);
      return;
    }

    let interval: NodeJS.Timeout;

    const pingDaemon = async () => {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        
        // Call the local sidecar. The sidecar should return an object if successful:
        // { status: 'ok', recent_events: HarnessEvent[] }
        const result: any = await invoke('ping_daemon').catch(() => null);
        
        if (result === 'ok' || result?.status === 'ok') {
          missedPings.current = 0;
          
          if (!isDaemonRunning) {
              setIsDaemonRunning(true);
          }
          setLastHeartbeat(new Date());

          // If the daemon passed back recent events, prepend them
          if (result?.recent_events && Array.isArray(result.recent_events)) {
            setAuditLogs(prev => {
              const deduplicated = [
                  ...result.recent_events,
                  ...prev
              ].filter((v, i, a) => a.findIndex(t => (t.id === v.id)) === i);
              return deduplicated.slice(0, 50); // Keep last 50 events in memory
            });
          }
        } else {
          missedPings.current++;
        }
      } catch (err) {
        missedPings.current++;
      }

      // Debounce logic: require 3 consecutive missed pings before flipping state to false
      // This prevents the UI from violently flashing if a single packet drops or event loop hangs
      if (missedPings.current > 2 && isDaemonRunning) {
        setIsDaemonRunning(false);
      }
    };

    pingDaemon();
    // Poll every 3 seconds for a responsive heartbeat
    interval = setInterval(pingDaemon, 3000);
    
    return () => clearInterval(interval);
  }, [isDaemonRunning]);

  return { isDaemonRunning, lastHeartbeat, auditLogs };
}
