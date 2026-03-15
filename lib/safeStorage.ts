/**
 * Safe Storage Wrapper
 * Wraps localStorage/sessionStorage to prevent crashes in private browsing modes (e.g., iOS Safari).
 * Falls back to in-memory storage if persistent storage is unavailable.
 */

class InMemoryStorage {
    private storage: Map<string, string>;

    constructor() {
        this.storage = new Map<string, string>();
    }

    getItem(key: string): string | null {
        return this.storage.get(key) || null;
    }

    setItem(key: string, value: string): void {
        this.storage.set(key, value);
    }

    removeItem(key: string): void {
        this.storage.delete(key);
    }

    clear(): void {
        this.storage.clear();
    }

    get length(): number {
        return this.storage.size;
    }

    key(index: number): string | null {
        const keys = Array.from(this.storage.keys());
        return keys[index] || null;
    }
}

const memoryStorage = new InMemoryStorage();

const isStorageAvailable = (type: 'localStorage' | 'sessionStorage'): boolean => {
    try {
        const storage = window[type];
        const x = '__storage_test__';
        storage.setItem(x, x);
        storage.removeItem(x);
        return true;
    } catch (e) {
        return false;
    }
};

export const safeLocalStorage = {
    getItem: (key: string): string | null => {
        try {
            if (typeof window !== 'undefined' && isStorageAvailable('localStorage')) {
                return window.localStorage.getItem(key);
            }
        } catch (e) { /* ignore */ }
        return memoryStorage.getItem(key);
    },

    setItem: (key: string, value: string): void => {
        try {
            if (typeof window !== 'undefined' && isStorageAvailable('localStorage')) {
                window.localStorage.setItem(key, value);
                return;
            }
        } catch (e) { /* ignore */ }
        memoryStorage.setItem(key, value);
    },

    removeItem: (key: string): void => {
        try {
            if (typeof window !== 'undefined' && isStorageAvailable('localStorage')) {
                window.localStorage.removeItem(key);
                return;
            }
        } catch (e) { /* ignore */ }
        memoryStorage.removeItem(key);
    },

    clear: (): void => {
        try {
            if (typeof window !== 'undefined' && isStorageAvailable('localStorage')) {
                window.localStorage.clear();
                return;
            }
        } catch (e) { /* ignore */ }
        memoryStorage.clear();
    }
};
