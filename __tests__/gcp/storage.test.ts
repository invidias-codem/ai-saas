import { GCPConfigurationError, getStorageClient, getStorageProjectId, isStorageConfigured, getStorageConfigError } from '@/lib/gcp/storage';

// Mock @google-cloud/storage
const mockBucket = jest.fn();
const mockFile = jest.fn();
const mockGetSignedUrl = jest.fn();

jest.mock('@google-cloud/storage', () => {
    return {
        Storage: jest.fn().mockImplementation(function(this: any, options: any) {
            this.options = options;
            this.bucket = mockBucket.mockReturnValue({
                file: mockFile.mockReturnValue({
                    getSignedUrl: mockGetSignedUrl
                })
            });
        })
    };
});

describe('GCP Storage Helper Unit Tests', () => {
    const originalEnv = { ...process.env };

    beforeEach(() => {
        jest.resetModules();
        jest.clearAllMocks();
        process.env = { ...originalEnv };
        
        // Remove active credentials from testing process.env to isolate tests
        delete process.env.GCP_SERVICE_ACCOUNT_KEY_JSON;
        delete process.env.FIREBASE_CLIENT_EMAIL;
        delete process.env.FIREBASE_PRIVATE_KEY;
        delete process.env.GCP_PROJECT_ID;
        delete process.env.FIREBASE_PROJECT_ID;
        delete process.env.GOOGLE_PROJECT_ID;
        delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test('should throw GCPConfigurationError if no credentials are configured', () => {
        process.env.GOOGLE_PROJECT_ID = 'test-project';
        
        // Dynamically import to ensure clean environment load
        const { getStorageClient, GCPConfigurationError: DynamicError } = require('@/lib/gcp/storage');
        
        expect(() => getStorageClient()).toThrow(DynamicError);
        expect(() => getStorageClient()).toThrow('No explicit credentials found');
    });

    test('should initialize successfully via GCP_SERVICE_ACCOUNT_KEY_JSON', () => {
        const fakeKey = {
            project_id: 'json-project-123',
            client_email: 'service-account@test.iam.gserviceaccount.com',
            private_key: '-----BEGIN PRIVATE KEY-----\\nFAKE_KEY\\n-----END PRIVATE KEY-----'
        };
        
        process.env.GCP_SERVICE_ACCOUNT_KEY_JSON = JSON.stringify(fakeKey);
        
        const { getStorageClient, getStorageProjectId } = require('@/lib/gcp/storage');
        const { Storage } = require('@google-cloud/storage');
        
        const client = getStorageClient();
        expect(client).toBeDefined();
        expect(Storage).toHaveBeenCalledWith(expect.objectContaining({
            projectId: 'json-project-123',
            credentials: expect.objectContaining({
                client_email: fakeKey.client_email,
                private_key: expect.stringContaining('FAKE_KEY')
            })
        }));
        
        expect(getStorageProjectId()).toBe('json-project-123');
    });

    test('should format single-line private keys in GCP_SERVICE_ACCOUNT_KEY_JSON correctly', () => {
        const fakeKey = {
            project_id: 'json-project-123',
            client_email: 'service-account@test.iam.gserviceaccount.com',
            private_key: '-----BEGIN PRIVATE KEY-----FAKE_KEY_SINGLE_LINE-----END PRIVATE KEY-----'
        };
        
        process.env.GCP_SERVICE_ACCOUNT_KEY_JSON = JSON.stringify(fakeKey);
        
        const { getStorageClient } = require('@/lib/gcp/storage');
        const { Storage } = require('@google-cloud/storage');
        
        getStorageClient();
        
        // Should have formatted the private key by inserting newlines
        const passedOptions = (Storage as jest.Mock).mock.calls[0][0];
        const formattedKey = passedOptions.credentials.private_key;
        expect(formattedKey).toContain('-----BEGIN PRIVATE KEY-----\n');
        expect(formattedKey).toContain('\n-----END PRIVATE KEY-----');
    });

    test('should initialize successfully via individual variables', () => {
        process.env.GCP_PROJECT_ID = 'individual-project';
        process.env.FIREBASE_CLIENT_EMAIL = 'individual@test.iam.gserviceaccount.com';
        process.env.FIREBASE_PRIVATE_KEY = '-----BEGIN PRIVATE KEY-----\\nINDIVIDUAL_FAKE_KEY\\n-----END PRIVATE KEY-----';
        
        const { getStorageClient, getStorageProjectId } = require('@/lib/gcp/storage');
        const { Storage } = require('@google-cloud/storage');
        
        const client = getStorageClient();
        expect(client).toBeDefined();
        expect(Storage).toHaveBeenCalledWith(expect.objectContaining({
            projectId: 'individual-project',
            credentials: expect.objectContaining({
                client_email: 'individual@test.iam.gserviceaccount.com',
                private_key: expect.stringContaining('INDIVIDUAL_FAKE_KEY')
            })
        }));
        
        expect(getStorageProjectId()).toBe('individual-project');
    });

    test('should fall back to GOOGLE_APPLICATION_CREDENTIALS path if provided', () => {
        process.env.GCP_PROJECT_ID = 'adc-project';
        process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/credentials.json';
        
        const { getStorageClient, getStorageProjectId } = require('@/lib/gcp/storage');
        const { Storage } = require('@google-cloud/storage');
        
        const client = getStorageClient();
        expect(client).toBeDefined();
        expect(Storage).toHaveBeenCalledWith(expect.objectContaining({
            projectId: 'adc-project',
            keyFilename: '/path/to/credentials.json'
        }));
        
        expect(getStorageProjectId()).toBe('adc-project');
    });

    test('should return correct project ID priority order', () => {
        const fakeKey = {
            project_id: 'priority-json',
            client_email: 'priority@test.iam.gserviceaccount.com',
            private_key: 'fake-key'
        };
        process.env.GCP_SERVICE_ACCOUNT_KEY_JSON = JSON.stringify(fakeKey);
        process.env.GCP_PROJECT_ID = 'priority-gcp';
        process.env.FIREBASE_PROJECT_ID = 'priority-firebase';
        process.env.GOOGLE_PROJECT_ID = 'priority-google';
        
        const { getStorageProjectId } = require('@/lib/gcp/storage');
        expect(getStorageProjectId()).toBe('priority-json');
        
        // Remove JSON key
        delete process.env.GCP_SERVICE_ACCOUNT_KEY_JSON;
        jest.resetModules();
        const { getStorageProjectId: getProjectId2 } = require('@/lib/gcp/storage');
        expect(getProjectId2()).toBe('priority-gcp');
        
        // Remove GCP_PROJECT_ID
        delete process.env.GCP_PROJECT_ID;
        jest.resetModules();
        const { getStorageProjectId: getProjectId3 } = require('@/lib/gcp/storage');
        expect(getProjectId3()).toBe('priority-firebase');
        
        // Remove FIREBASE_PROJECT_ID
        delete process.env.FIREBASE_PROJECT_ID;
        jest.resetModules();
        const { getStorageProjectId: getProjectId4 } = require('@/lib/gcp/storage');
        expect(getProjectId4()).toBe('priority-google');
    });

    test('should reuse the client instance (singleton behavior)', () => {
        const fakeKey = {
            project_id: 'singleton-project',
            client_email: 'singleton@test.iam.gserviceaccount.com',
            private_key: 'fake-key'
        };
        process.env.GCP_SERVICE_ACCOUNT_KEY_JSON = JSON.stringify(fakeKey);
        
        const { getStorageClient } = require('@/lib/gcp/storage');
        const { Storage } = require('@google-cloud/storage');
        
        const client1 = getStorageClient();
        const client2 = getStorageClient();
        
        expect(client1).toBe(client2);
        expect(Storage).toHaveBeenCalledTimes(1);
    });

    test('should expose correct diagnostic helpers', () => {
        // Unconfigured
        const { isStorageConfigured, getStorageConfigError } = require('@/lib/gcp/storage');
        expect(isStorageConfigured()).toBe(false);
        expect(getStorageConfigError()).toContain('No explicit credentials found');
        
        // Configured
        const fakeKey = {
            project_id: 'diag-project',
            client_email: 'diag@test.iam.gserviceaccount.com',
            private_key: 'fake-key'
        };
        process.env.GCP_SERVICE_ACCOUNT_KEY_JSON = JSON.stringify(fakeKey);
        
        jest.resetModules();
        const { isStorageConfigured: isConfigured2, getStorageConfigError: getError2 } = require('@/lib/gcp/storage');
        expect(isConfigured2()).toBe(true);
        expect(getError2()).toBeNull();
    });
});
