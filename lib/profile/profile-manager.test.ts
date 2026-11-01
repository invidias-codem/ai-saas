import { invoke } from '@tauri-apps/api/core';
import { createProfile, listProfiles, ProfileManager } from './profile-manager';

jest.mock('@tauri-apps/api/core', () => ({ invoke: jest.fn() }));
const nativeInvoke = jest.mocked(invoke);

beforeEach(() => nativeInvoke.mockReset());

test('new profiles persist their defaults using only the native ID and channel interface', async () => {
  nativeInvoke.mockResolvedValue(null);
  const profile = await createProfile('preview');
  expect(nativeInvoke).toHaveBeenNthCalledWith(1, 'load_profile_config', { profileId: profile.profileId, channel: 'preview' });
  expect(nativeInvoke).toHaveBeenNthCalledWith(2, 'save_profile_config', { profileId: profile.profileId, channel: 'preview', settings: profile.currentSettings });
  expect(profile.currentSettings?.version).toBe(1);
});

test('a native profile failure does not masquerade as a successfully empty profile inventory', async () => {
  nativeInvoke.mockRejectedValue(new Error('Storage unavailable'));
  await expect(listProfiles('stable')).rejects.toThrow('Storage unavailable');
});

test('traversal IDs are rejected before any IPC command is invoked', () => {
  expect(() => new ProfileManager({ profileId: '../outside' })).toThrow('Invalid profile ID');
  expect(nativeInvoke).not.toHaveBeenCalled();
});
