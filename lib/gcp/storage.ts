/**
 * Centralized GCP Storage Client Helper
 * 
 * This module ensures the Google Cloud Storage client is initialized only once with proper credentials,
 * utilizing a multi-layered configuration lookup:
 * 1. GCP_SERVICE_ACCOUNT_KEY_JSON (Parsed JSON credential string)
 * 2. FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY (Individual Firebase/GCP credentials)
 * 3. GOOGLE_APPLICATION_CREDENTIALS (Standard ADC environment pointer)
 * 
 * If credentials are missing or invalid, throws a descriptive configuration error.
 */

import { Storage } from '@google-cloud/storage';
import { env } from '@/lib/env';
import { shouldQuietBuildLogs } from '@/lib/runtime/buildPhase';

// Custom configuration error class
export class GCPConfigurationError extends Error {
    constructor(message: string) {
        super(`[GCP_STORAGE_CONFIG_ERROR] ${message}`);
        this.name = 'GCPConfigurationError';
    }
}

// Caching Storage instance to avoid multiple client creations
let storageInstance: Storage | null = null;
let isConfigured = false;
let configErrorMsg: string | null = null;

/**
 * Ensures private key is in proper PEM format
 */
function formatPrivateKey(key: string): string {
    let formatted = key.replace(/\\n/g, '\n');
    if (formatted.indexOf('\n') === -1) {
        formatted = formatted
            .replace('-----BEGIN PRIVATE KEY-----', '-----BEGIN PRIVATE KEY-----\n')
            .replace('-----END PRIVATE KEY-----', '\n-----END PRIVATE KEY-----');
    }
    return formatted;
}

/**
 * Retrieve GCP project ID from the prioritized env variables or service account JSON
 */
export function getStorageProjectId(): string {
    // 1. Try JSON credentials first
    if (env.GCP_SERVICE_ACCOUNT_KEY_JSON) {
        try {
            const parsed = JSON.parse(env.GCP_SERVICE_ACCOUNT_KEY_JSON);
            if (parsed.project_id) return parsed.project_id;
        } catch {
            // Let the main initializer handle and report parse error
        }
    }
    
    // 2. Fallbacks
    const projectId = env.GCP_PROJECT_ID || env.FIREBASE_PROJECT_ID || env.GOOGLE_PROJECT_ID;
    if (!projectId) {
        throw new GCPConfigurationError('GCP Project ID is missing from configuration (GCP_PROJECT_ID, FIREBASE_PROJECT_ID, or GOOGLE_PROJECT_ID).');
    }
    return projectId;
}

/**
 * Main initializer for GCP Storage client
 */
function initializeStorage(): Storage {
    const projectId = env.GCP_PROJECT_ID || env.FIREBASE_PROJECT_ID || env.GOOGLE_PROJECT_ID;
    
    // Scenario 1: Parse GCP_SERVICE_ACCOUNT_KEY_JSON
    if (env.GCP_SERVICE_ACCOUNT_KEY_JSON) {
        try {
            let cleanedJson = env.GCP_SERVICE_ACCOUNT_KEY_JSON.trim();
            if ((cleanedJson.startsWith("'") && cleanedJson.endsWith("'")) ||
                (cleanedJson.startsWith('"') && cleanedJson.endsWith('"'))) {
                cleanedJson = cleanedJson.slice(1, -1);
            }
            
            const parsed = JSON.parse(cleanedJson);
            if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
                throw new GCPConfigurationError('Parsed GCP_SERVICE_ACCOUNT_KEY_JSON is missing one or more required keys: project_id, client_email, private_key.');
            }
            
            const privateKey = formatPrivateKey(parsed.private_key);
            const storage = new Storage({
                projectId: parsed.project_id,
                credentials: {
                    client_email: parsed.client_email,
                    private_key: privateKey
                }
            });
            
            if (!shouldQuietBuildLogs()) {
                console.log('[GCP_STORAGE] Successfully initialized via GCP_SERVICE_ACCOUNT_KEY_JSON');
            }
            isConfigured = true;
            return storage;
        } catch (error: any) {
            configErrorMsg = `Failed to parse GCP_SERVICE_ACCOUNT_KEY_JSON: ${error.message}`;
            if (!shouldQuietBuildLogs()) {
                console.error('[GCP_STORAGE] Credentials initialization error:', error);
            }
            throw new GCPConfigurationError(configErrorMsg);
        }
    }
    
    // Scenario 2: Parse individual variables
    const clientEmail = env.FIREBASE_CLIENT_EMAIL;
    const rawPrivateKey = env.FIREBASE_PRIVATE_KEY;
    
    if (clientEmail && rawPrivateKey && projectId) {
        try {
            const privateKey = formatPrivateKey(rawPrivateKey);
            const storage = new Storage({
                projectId,
                credentials: {
                    client_email: clientEmail,
                    private_key: privateKey
                }
            });
            
            if (!shouldQuietBuildLogs()) {
                console.log('[GCP_STORAGE] Successfully initialized via individual environment variables');
            }
            isConfigured = true;
            return storage;
        } catch (error: any) {
            configErrorMsg = `Failed to initialize via individual env vars: ${error.message}`;
            throw new GCPConfigurationError(configErrorMsg);
        }
    }
    
    // Scenario 3: Fall back to GOOGLE_APPLICATION_CREDENTIALS path
    if (env.GOOGLE_APPLICATION_CREDENTIALS) {
        try {
            const storage = new Storage({
                projectId: projectId || undefined,
                keyFilename: env.GOOGLE_APPLICATION_CREDENTIALS
            });
            
            if (!shouldQuietBuildLogs()) {
                console.log('[GCP_STORAGE] Initialized using GOOGLE_APPLICATION_CREDENTIALS path');
            }
            isConfigured = true;
            return storage;
        } catch (error: any) {
            configErrorMsg = `Failed to initialize with GOOGLE_APPLICATION_CREDENTIALS: ${error.message}`;
            throw new GCPConfigurationError(configErrorMsg);
        }
    }
    
    // Scenario 4: No credentials found
    configErrorMsg = 'No explicit credentials found (GCP_SERVICE_ACCOUNT_KEY_JSON, individual variables, or GOOGLE_APPLICATION_CREDENTIALS).';
    throw new GCPConfigurationError(configErrorMsg);
}

/**
 * Retrieves the singleton Storage client.
 * Throws GCPConfigurationError if credentials are not configured.
 */
export function getStorageClient(): Storage {
    if (storageInstance) {
        return storageInstance;
    }
    
    try {
        storageInstance = initializeStorage();
        return storageInstance;
    } catch (error) {
        // Cache configuration failures as errors to prevent repeated slow initialization attempts
        storageInstance = null;
        throw error;
    }
}

/**
 * Returns whether the GCP Storage client is properly initialized and credentials exist
 */
export function isStorageConfigured(): boolean {
    if (isConfigured) return true;
    try {
        getStorageClient();
        return true;
    } catch {
        return false;
    }
}

/**
 * Diagnostic utility for retrieving the configuration error message if any
 */
export function getStorageConfigError(): string | null {
    if (configErrorMsg) return configErrorMsg;
    try {
        getStorageClient();
        return null;
    } catch (error: any) {
        return error.message;
    }
}
