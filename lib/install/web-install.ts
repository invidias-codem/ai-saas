type InstallChoice = { outcome: 'accepted' | 'dismissed' };
export interface WebInstallPrompt extends Event {
  prompt(): Promise<void | InstallChoice>;
  userChoice: Promise<InstallChoice>;
}
export type WebInstallState = {
  status: 'idle' | 'ready' | 'prompting' | 'accepted' | 'dismissed' | 'failed' | 'installed';
  installed: boolean;
};
const initialState: WebInstallState = { status: 'idle', installed: false };

/** Each browser event is single-use; capturing it never opens the native prompt. */
export function createWebInstallController() {
  let state = initialState;
  let deferred: WebInstallPrompt | null = null;
  const listeners = new Set<() => void>();
  const publish = (next: WebInstallState) => { state = next; listeners.forEach(listener => listener()); };
  return {
    getSnapshot: () => state,
    getServerSnapshot: () => initialState,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    capture(event: Event) {
      const candidate = event as Partial<WebInstallPrompt>;
      if (state.installed || state.status === 'prompting' || typeof candidate.prompt !== 'function' || !candidate.userChoice) return;
      event.preventDefault();
      deferred = event as WebInstallPrompt;
      publish({ status: 'ready', installed: false });
    },
    markInstalled() {
      deferred = null;
      publish({ status: 'installed', installed: true });
    },
    async install(): Promise<InstallChoice['outcome'] | 'failed' | 'unavailable'> {
      if (!deferred || state.installed || state.status === 'prompting') return 'unavailable';
      const event = deferred;
      deferred = null;
      publish({ status: 'prompting', installed: false });
      try {
        // Invoke synchronously in the click handler, before awaiting anything.
        const result = await event.prompt();
        const choice = result ?? await event.userChoice;
        if (!state.installed) publish({ status: choice.outcome, installed: false });
        return choice.outcome;
      } catch {
        if (!state.installed) publish({ status: 'failed', installed: false });
        return 'failed';
      }
    },
  };
}
