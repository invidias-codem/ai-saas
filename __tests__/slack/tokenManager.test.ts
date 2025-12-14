/**
 * Token Manager Tests
 * Tests for multi-tenant Slack token resolution
 */

import {
  getSlackConfig,
  saveSlackInstallation,
  removeSlackInstallation,
  getInstallationsForUser,
  hasInstallation,
  getInstallation,
  linkInstallationToUser,
  validateInstallation,
} from '@/lib/slack/tokenManager';

// Mock Firebase Admin
jest.mock('firebase-admin', () => {
  const mockDoc = {
    exists: true,
    data: jest.fn(),
    id: 'T123ABC456',
  };

  const mockDocRef = {
    get: jest.fn().mockResolvedValue(mockDoc),
    set: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    delete: jest.fn().mockResolvedValue(undefined),
  };

  const mockCollection = {
    doc: jest.fn().mockReturnValue(mockDocRef),
    where: jest.fn().mockReturnThis(),
    get: jest.fn().mockResolvedValue({ docs: [] }),
    add: jest.fn().mockResolvedValue({ id: 'event_123' }),
  };

  const mockFirestore = {
    collection: jest.fn().mockReturnValue(mockCollection),
  };

  return {
    apps: [],
    initializeApp: jest.fn(),
    firestore: jest.fn().mockReturnValue(mockFirestore),
  };
});

// Mock fetch for API calls
global.fetch = jest.fn();

describe('Token Manager', () => {
  const mockInstallation = {
    teamId: 'T123ABC456',
    teamName: 'Test Workspace',
    botToken: 'xoxb-test-token-123',
    botUserId: 'U987XYZ',
    installedBy: {
      slackUserId: 'U111AAA',
      clerkUserId: 'user_abc123',
    },
    scopes: ['chat:write', 'commands', 'app_mentions:read'],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Setup default mock behavior
    const admin = require('firebase-admin');
    const mockDocRef = admin.firestore().collection().doc();
    mockDocRef.get.mockResolvedValue({
      exists: true,
      data: () => mockInstallation,
    });
  });

  describe('getSlackConfig', () => {
    it('should return config for existing installation', async () => {
      const config = await getSlackConfig('T123ABC456');

      expect(config).toEqual({
        teamId: 'T123ABC456',
        teamName: 'Test Workspace',
        botToken: 'xoxb-test-token-123',
        botUserId: 'U987XYZ',
        scopes: ['chat:write', 'commands', 'app_mentions:read'],
      });
    });

    it('should throw error for non-existent installation', async () => {
      const admin = require('firebase-admin');
      const mockDocRef = admin.firestore().collection().doc();
      mockDocRef.get.mockResolvedValue({ exists: false });

      await expect(getSlackConfig('T_NONEXISTENT')).rejects.toThrow(
        'No Slack installation found for team T_NONEXISTENT'
      );
    });

    it('should throw error for empty team ID', async () => {
      await expect(getSlackConfig('')).rejects.toThrow('Team ID is required');
    });

    it('should throw error for invalid installation data', async () => {
      const admin = require('firebase-admin');
      const mockDocRef = admin.firestore().collection().doc();
      mockDocRef.get.mockResolvedValue({
        exists: true,
        data: () => ({ teamId: 'T123', teamName: 'Test' }), // Missing botToken and botUserId
      });

      await expect(getSlackConfig('T123')).rejects.toThrow(
        'Invalid Slack installation for team T123'
      );
    });
  });

  describe('saveSlackInstallation', () => {
    it('should create new installation', async () => {
      const admin = require('firebase-admin');
      const mockDocRef = admin.firestore().collection().doc();
      mockDocRef.get.mockResolvedValue({ exists: false });

      await saveSlackInstallation({
        teamId: 'T_NEW',
        teamName: 'New Workspace',
        botToken: 'xoxb-new-token',
        botUserId: 'U_NEW',
        installedBy: { slackUserId: 'U111' },
        scopes: ['chat:write'],
      });

      expect(mockDocRef.set).toHaveBeenCalledWith(
        expect.objectContaining({
          teamId: 'T_NEW',
          teamName: 'New Workspace',
          botToken: 'xoxb-new-token',
        })
      );
    });

    it('should update existing installation', async () => {
      const admin = require('firebase-admin');
      const mockDocRef = admin.firestore().collection().doc();
      mockDocRef.get.mockResolvedValue({ exists: true });

      await saveSlackInstallation({
        teamId: 'T123ABC456',
        teamName: 'Updated Workspace',
        botToken: 'xoxb-updated-token',
        botUserId: 'U987XYZ',
        installedBy: { slackUserId: 'U111AAA' },
        scopes: ['chat:write', 'commands'],
      });

      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          teamName: 'Updated Workspace',
          botToken: 'xoxb-updated-token',
        })
      );
    });

    it('should throw error for empty team ID', async () => {
      await expect(
        saveSlackInstallation({
          teamId: '',
          teamName: 'Test',
          botToken: 'token',
          botUserId: 'U123',
          installedBy: { slackUserId: 'U111' },
          scopes: [],
        })
      ).rejects.toThrow('Team ID is required');
    });
  });

  describe('removeSlackInstallation', () => {
    it('should delete existing installation', async () => {
      const admin = require('firebase-admin');
      const mockDocRef = admin.firestore().collection().doc();
      mockDocRef.get.mockResolvedValue({ exists: true });

      await removeSlackInstallation('T123ABC456');

      expect(mockDocRef.delete).toHaveBeenCalled();
    });

    it('should handle non-existent installation gracefully', async () => {
      const admin = require('firebase-admin');
      const mockDocRef = admin.firestore().collection().doc();
      mockDocRef.get.mockResolvedValue({ exists: false });

      // Should not throw
      await expect(removeSlackInstallation('T_NONEXISTENT')).resolves.not.toThrow();
    });

    it('should throw error for empty team ID', async () => {
      await expect(removeSlackInstallation('')).rejects.toThrow('Team ID is required');
    });
  });

  describe('hasInstallation', () => {
    it('should return true for existing installation', async () => {
      const admin = require('firebase-admin');
      const mockDocRef = admin.firestore().collection().doc();
      mockDocRef.get.mockResolvedValue({ exists: true });

      const result = await hasInstallation('T123ABC456');
      expect(result).toBe(true);
    });

    it('should return false for non-existent installation', async () => {
      const admin = require('firebase-admin');
      const mockDocRef = admin.firestore().collection().doc();
      mockDocRef.get.mockResolvedValue({ exists: false });

      const result = await hasInstallation('T_NONEXISTENT');
      expect(result).toBe(false);
    });

    it('should return false for empty team ID', async () => {
      const result = await hasInstallation('');
      expect(result).toBe(false);
    });
  });

  describe('getInstallationsForUser', () => {
    it('should return installations for user', async () => {
      const admin = require('firebase-admin');
      const mockCollection = admin.firestore().collection();
      mockCollection.get.mockResolvedValue({
        docs: [
          { data: () => mockInstallation },
          { data: () => ({ ...mockInstallation, teamId: 'T_SECOND', teamName: 'Second Workspace' }) },
        ],
      });

      const installations = await getInstallationsForUser('user_abc123');

      expect(installations).toHaveLength(2);
      expect(installations[0].teamId).toBe('T123ABC456');
      expect(installations[1].teamId).toBe('T_SECOND');
    });

    it('should return empty array for user with no installations', async () => {
      const admin = require('firebase-admin');
      const mockCollection = admin.firestore().collection();
      mockCollection.get.mockResolvedValue({ docs: [] });

      const installations = await getInstallationsForUser('user_no_installs');
      expect(installations).toEqual([]);
    });

    it('should return empty array for empty user ID', async () => {
      const installations = await getInstallationsForUser('');
      expect(installations).toEqual([]);
    });
  });

  describe('linkInstallationToUser', () => {
    it('should link installation to user', async () => {
      const admin = require('firebase-admin');
      const mockDocRef = admin.firestore().collection().doc();
      mockDocRef.get.mockResolvedValue({ exists: true });

      await linkInstallationToUser('T123ABC456', 'user_new');

      expect(mockDocRef.update).toHaveBeenCalledWith(
        expect.objectContaining({
          'installedBy.clerkUserId': 'user_new',
        })
      );
    });

    it('should throw error for non-existent installation', async () => {
      const admin = require('firebase-admin');
      const mockDocRef = admin.firestore().collection().doc();
      mockDocRef.get.mockResolvedValue({ exists: false });

      await expect(linkInstallationToUser('T_NONEXISTENT', 'user_123')).rejects.toThrow(
        'No installation found for team T_NONEXISTENT'
      );
    });

    it('should throw error for missing parameters', async () => {
      await expect(linkInstallationToUser('', 'user_123')).rejects.toThrow(
        'Team ID and Clerk User ID are required'
      );
      await expect(linkInstallationToUser('T123', '')).rejects.toThrow(
        'Team ID and Clerk User ID are required'
      );
    });
  });

  describe('validateInstallation', () => {
    it('should return valid for working token', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        json: () => Promise.resolve({ ok: true, team: 'Test' }),
      });

      const result = await validateInstallation('T123ABC456');

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should return invalid for revoked token', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        json: () => Promise.resolve({ ok: false, error: 'token_revoked' }),
      });

      const result = await validateInstallation('T123ABC456');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('token_revoked');
    });

    it('should handle network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await validateInstallation('T123ABC456');

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });
});
