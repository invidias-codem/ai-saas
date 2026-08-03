/**
 * Native secret storage abstraction.
 *
 * Behavior:
 * - Tauri/native: uses `tauri-plugin-stronghold` when available.
 * - Web/fallback: no-op passthrough so callers don't need to branch.
 */

export type SecretStore = {
  getSecret(key: string): Promise<string | null>;
  setSecret(key: string, value: string): Promise<void>;
  removeSecret(key: string): Promise<void>;
};

function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window || '__TAURI_INSPECT__' in window || '__TAURI_IPC__' in window;
}

let strongholdClientPromise: Promise<any> | null = null;

async function getStrongholdStore(): Promise<any | null> {
  if (!isTauri()) return null;
  if (!strongholdClientPromise) {
    strongholdClientPromise = (async () => {
      try {
        const { Stronghold } = await import('@tauri-apps/plugin-stronghold');
        const stronghold = await Stronghold.load('.lattice_auth.vault', 'lattice_secure_enclave_key_123');
        let client;
        try {
          client = await stronghold.loadClient('secrets');
        } catch {
          client = await stronghold.createClient('secrets');
        }
        return client.getStore();
      } catch (err) {
        console.error('[secretStore] Stronghold init failed:', err);
        return null;
      }
    })();
  }
  return strongholdClientPromise;
}

export async function createSecretStore(): Promise<SecretStore> {
  const store = await getStrongholdStore();

  if (!store) {
    return {
      async getSecret(_key: string) {
        return null;
      },
      async setSecret(_key: string, _value: string) {
        // no-op in web mode
      },
      async removeSecret(_key: string) {
        // no-op in web mode
      },
    };
  }

  return {
    async getSecret(key: string) {
      try {
        const raw = await store.get(key);
        if (!raw) return null;
        if (typeof raw === 'string') return raw;
        if (Array.isArray(raw)) {
          const text = new TextDecoder().decode(new Uint8Array(raw));
          return text;
        }
        return null;
      } catch (err) {
        console.error('[secretStore] getSecret failed:', err);
        return null;
      }
    },
    async setSecret(key: string, value: string) {
      try {
        const bytes = Array.from(new TextEncoder().encode(value));
        await store.insert(key, bytes);
        await store.save();
      } catch (err) {
        console.error('[secretStore] setSecret failed:', err);
        throw err;
      }
    },
    async removeSecret(key: string) {
      try {
        await store.remove(key);
        await store.save();
      } catch (err) {
        console.error('[secretStore] removeSecret failed:', err);
        throw err;
      }
    },
  };
}
