import { safeStorage, app } from 'electron';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

interface TokenStore {
  encryptedAccess: string;
  encryptedRefresh: string;
  deviceId: string;
}

const userDataPath = app?.getPath ? app.getPath('userData') : (require('os').tmpdir());
const STORE_PATH = path.join(userDataPath, 'lattice_auth.json');

export const AuthManager = {
  saveTokens(accessToken: string, refreshToken: string, deviceId: string) {
    let encryptedAccess: string;
    let encryptedRefresh: string;

    if (safeStorage && safeStorage.isEncryptionAvailable()) {
      encryptedAccess = safeStorage.encryptString(accessToken).toString('base64');
      encryptedRefresh = safeStorage.encryptString(refreshToken).toString('base64');
    } else {
      console.warn('OS-level encryption is not available, using base64 encoding fallback');
      encryptedAccess = Buffer.from(accessToken).toString('base64');
      encryptedRefresh = Buffer.from(refreshToken).toString('base64');
    }

    const store: TokenStore = {
      encryptedAccess,
      encryptedRefresh,
      deviceId,
    };

    // Atomic write with restrictive permissions so the file is never left
    // world-readable or in a partially-written state.
    const tmpPath = `${STORE_PATH}.tmp-${crypto.randomUUID()}`;
    fs.writeFileSync(tmpPath, JSON.stringify(store), 'utf-8');
    fs.chmodSync(tmpPath, 0o600);
    fs.renameSync(tmpPath, STORE_PATH);
  },

  getTokens() {
    if (!fs.existsSync(STORE_PATH)) return null;

    try {
      const store: TokenStore = JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
      
      let accessToken: string;
      let refreshToken: string;

      if (safeStorage && safeStorage.isEncryptionAvailable()) {
        accessToken = safeStorage.decryptString(Buffer.from(store.encryptedAccess, 'base64'));
        refreshToken = safeStorage.decryptString(Buffer.from(store.encryptedRefresh, 'base64'));
      } else {
        accessToken = Buffer.from(store.encryptedAccess, 'base64').toString('utf-8');
        refreshToken = Buffer.from(store.encryptedRefresh, 'base64').toString('utf-8');
      }

      return {
        accessToken,
        refreshToken,
        deviceId: store.deviceId,
      };
    } catch (error) {
      console.error('Failed to read or decrypt tokens:', error);
      return null;
    }
  },

  clearTokens() {
    if (fs.existsSync(STORE_PATH)) {
      fs.unlinkSync(STORE_PATH);
    }
  }
};
