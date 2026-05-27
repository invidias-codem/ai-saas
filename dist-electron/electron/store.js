"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.SecureVault = void 0;
const electron_1 = require("electron");
let storeInstance = null;
class SecureVault {
    static async init() {
        if (!electron_1.app.isReady()) {
            throw new Error("SecureVault must be initialized after app.whenReady()");
        }
        if (!storeInstance) {
            // Dynamically import pure ESM module 'electron-store' in CommonJS context
            const Store = (await Promise.resolve().then(() => __importStar(require('electron-store')))).default;
            storeInstance = new Store({
                name: 'lattice-os-vault',
                clearInvalidConfig: true
            });
        }
    }
    static checkInit() {
        if (!storeInstance) {
            throw new Error("SecureVault not initialized. Call init() first.");
        }
    }
    static async setApiKey(provider, key) {
        this.checkInit();
        if (!key) {
            storeInstance.delete(`apiKeys.${provider}`);
            return;
        }
        if (electron_1.safeStorage.isEncryptionAvailable()) {
            const encrypted = electron_1.safeStorage.encryptString(key);
            storeInstance.set(`apiKeys.${provider}`, encrypted.toString('base64'));
        }
        else {
            console.warn("safeStorage is not available. Storing API key in plaintext.");
            storeInstance.set(`apiKeys.${provider}`, key);
        }
    }
    static async getApiKey(provider) {
        this.checkInit();
        const storedValue = storeInstance.get(`apiKeys.${provider}`);
        if (!storedValue) {
            return null;
        }
        if (electron_1.safeStorage.isEncryptionAvailable()) {
            try {
                const buffer = Buffer.from(storedValue, 'base64');
                return electron_1.safeStorage.decryptString(buffer);
            }
            catch (err) {
                console.error(`Failed to decrypt API key for ${provider}:`, err);
                // Fallback in case it was stored as plaintext before encryption was available
                return storedValue;
            }
        }
        else {
            return storedValue;
        }
    }
}
exports.SecureVault = SecureVault;
