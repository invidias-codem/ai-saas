import { app, safeStorage } from 'electron';

let storeInstance: any = null;

export class SecureVault {
  static async init() {
    if (!app.isReady()) {
      throw new Error("SecureVault must be initialized after app.whenReady()");
    }

    if (!storeInstance) {
      // Dynamically import pure ESM module 'electron-store' in CommonJS context
      const Store = (await import('electron-store')).default;
      storeInstance = new Store({
        name: 'lattice-os-vault',
        clearInvalidConfig: true
      });
    }
  }

  private static checkInit() {
    if (!storeInstance) {
      throw new Error("SecureVault not initialized. Call init() first.");
    }
  }

  static async setApiKey(provider: 'google' | 'anthropic', key: string): Promise<void> {
    this.checkInit();
    
    if (!key) {
      storeInstance.delete(`apiKeys.${provider}`);
      return;
    }

    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(key);
      storeInstance.set(`apiKeys.${provider}`, encrypted.toString('base64'));
    } else {
      console.warn("safeStorage is not available. Storing API key in plaintext.");
      storeInstance.set(`apiKeys.${provider}`, key);
    }
  }

  static async getApiKey(provider: 'google' | 'anthropic'): Promise<string | null> {
    this.checkInit();

    const storedValue = storeInstance.get(`apiKeys.${provider}`) as string | undefined;
    if (!storedValue) {
      return null;
    }

    if (safeStorage.isEncryptionAvailable()) {
      try {
        const buffer = Buffer.from(storedValue, 'base64');
        return safeStorage.decryptString(buffer);
      } catch (err) {
        console.error(`Failed to decrypt API key for ${provider}:`, err);
        // Fallback in case it was stored as plaintext before encryption was available
        return storedValue;
      }
    } else {
      return storedValue;
    }
  }
}
