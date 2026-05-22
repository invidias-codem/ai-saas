process.env.SLACK_TOKEN_ENCRYPTION_KEY = 'test-encryption-key';

/**
 * Token Manager Tests
 * Tests for multi-tenant Slack token resolution (Supabase Edition)
 */

import {
  getSlackConfig,
  saveSlackInstallation,
  removeSlackInstallation,
  hasInstallation,
} from '@/lib/slack/tokenManager';

const mockFrom = jest.fn();
const mockRpc = jest.fn();
const mockSelect = jest.fn();
const mockDelete = jest.fn();
const mockEq = jest.fn();
const mockSingle = jest.fn();

jest.mock('@/lib/supabaseClient', () => ({
  supabase: {
    from: (...args: any[]) => mockFrom(...args),
    rpc: (...args: any[]) => mockRpc(...args),
  }
}));

describe('Token Manager', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Setup fluent chain defaults
    mockRpc.mockReturnValue({
      single: mockSingle,
    });
    mockFrom.mockReturnValue({
      select: mockSelect,
      delete: mockDelete,
    });
    mockSelect.mockReturnValue({
      eq: mockEq,
    });
    mockDelete.mockReturnValue({
      eq: mockEq,
    });
    mockEq.mockReturnValue(Promise.resolve({ data: null, error: null, count: 0 }));
    mockSingle.mockReturnValue(Promise.resolve({ data: null, error: null }));
  });

  describe('getSlackConfig', () => {
    it('should return config for existing installation', async () => {
      mockSingle.mockResolvedValueOnce({
        data: {
          slack_team_id: 'T123ABC456',
          access_token: 'xoxb-test-token-123',
          bot_user_id: 'U987XYZ',
          user_id: 'user_123_supabase',
        },
        error: null,
      });

      const config = await getSlackConfig('T123ABC456');

      expect(config).toEqual({
        teamId: 'T123ABC456',
        teamName: 'Workspace',
        botToken: 'xoxb-test-token-123',
        botUserId: 'U987XYZ',
        scopes: [],
        userId: 'user_123_supabase',
      });

      expect(mockRpc).toHaveBeenCalledWith('get_slack_integration', {
        p_slack_team_id: 'T123ABC456',
        p_encryption_key: 'test-encryption-key',
      });
    });

    it('should throw error for non-existent installation', async () => {
      mockSingle.mockResolvedValueOnce({
        data: null,
        error: { message: 'Not found' },
      });

      await expect(getSlackConfig('T_NONEXISTENT')).rejects.toThrow(
        'No Slack installation found for team T_NONEXISTENT'
      );
    });

    it('should throw error for invalid installation data', async () => {
      mockSingle.mockResolvedValueOnce({
        data: {
          slack_team_id: 'T123',
          access_token: '',
          bot_user_id: '',
        },
        error: null,
      });

      await expect(getSlackConfig('T123')).rejects.toThrow(
        'Invalid Slack installation for team T123'
      );
    });
  });

  describe('saveSlackInstallation', () => {
    it('should upsert installation', async () => {
      mockRpc.mockResolvedValueOnce({ error: null });

      await saveSlackInstallation({
        teamId: 'T_NEW',
        teamName: 'New Workspace',
        botToken: 'xoxb-new-token',
        botUserId: 'U_NEW',
        userId: 'user_new_supabase',
      });

      expect(mockRpc).toHaveBeenCalledWith('upsert_slack_integration', {
        p_slack_team_id: 'T_NEW',
        p_slack_team_name: 'New Workspace',
        p_access_token: 'xoxb-new-token',
        p_bot_user_id: 'U_NEW',
        p_user_id: 'user_new_supabase',
        p_encryption_key: 'test-encryption-key',
      });
    });

    it('should throw error if upsert RPC fails', async () => {
      mockRpc.mockResolvedValueOnce({
        error: { message: 'Database error upserting' },
      });

      await expect(
        saveSlackInstallation({
          teamId: 'T_NEW',
          teamName: 'New Workspace',
          botToken: 'xoxb-new-token',
          botUserId: 'U_NEW',
        })
      ).rejects.toThrow('Failed to save installation: Database error upserting');
    });

    it('should throw error for empty team ID', async () => {
      await expect(
        saveSlackInstallation({
          teamId: '',
          teamName: 'Test',
          botToken: 'token',
          botUserId: 'U123',
        })
      ).rejects.toThrow('Team ID is required');
    });
  });

  describe('removeSlackInstallation', () => {
    it('should delete existing installation', async () => {
      mockEq.mockResolvedValueOnce({ error: null });

      await removeSlackInstallation('T123ABC456');

      expect(mockFrom).toHaveBeenCalledWith('slack_integrations');
      expect(mockDelete).toHaveBeenCalled();
      expect(mockEq).toHaveBeenCalledWith('slack_team_id', 'T123ABC456');
    });

    it('should throw error if database deletion fails', async () => {
      mockEq.mockResolvedValueOnce({ error: { message: 'Delete failed' } });

      await expect(removeSlackInstallation('T123ABC456')).rejects.toThrow(
        'Failed to remove installation'
      );
    });

    it('should throw error for empty team ID', async () => {
      await expect(removeSlackInstallation('')).rejects.toThrow('Team ID is required');
    });
  });

  describe('hasInstallation', () => {
    it('should return true for existing installation', async () => {
      mockEq.mockResolvedValueOnce({
        count: 1,
        error: null,
      });

      const result = await hasInstallation('T123ABC456');
      expect(result).toBe(true);
      expect(mockFrom).toHaveBeenCalledWith('slack_integrations');
      expect(mockSelect).toHaveBeenCalledWith('*', { count: 'exact', head: true });
      expect(mockEq).toHaveBeenCalledWith('slack_team_id', 'T123ABC456');
    });

    it('should return false for non-existent installation', async () => {
      mockEq.mockResolvedValueOnce({
        count: 0,
        error: null,
      });

      const result = await hasInstallation('T_NONEXISTENT');
      expect(result).toBe(false);
    });

    it('should return false if database error occurs', async () => {
      mockEq.mockResolvedValueOnce({
        count: null,
        error: { message: 'DB Error' },
      });

      const result = await hasInstallation('T123');
      expect(result).toBe(false);
    });

    it('should return false for empty team ID', async () => {
      const result = await hasInstallation('');
      expect(result).toBe(false);
    });
  });
});
