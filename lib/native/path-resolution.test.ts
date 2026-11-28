import { invoke } from '@tauri-apps/api/core';
import { getChannelPaths, resolveNativePaths } from './path-resolution';

jest.mock('@tauri-apps/api/core', () => ({ invoke: jest.fn() }));
const nativeInvoke = jest.mocked(invoke);
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

afterEach(() => {
  if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
  else Reflect.deleteProperty(globalThis, 'window');
  nativeInvoke.mockReset();
});

test('browser callers use display paths without invoking native commands', async () => {
  Reflect.deleteProperty(globalThis, 'window');
  expect(await resolveNativePaths('stable')).toEqual(getChannelPaths('stable'));
  expect(nativeInvoke).not.toHaveBeenCalled();
});

test('native callers use the selected channel returned by Rust', async () => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { __TAURI_INTERNALS__: {} } });
  const paths = getChannelPaths('preview');
  nativeInvoke.mockResolvedValue(paths);
  expect(await resolveNativePaths('preview')).toEqual(paths);
  expect(nativeInvoke).toHaveBeenCalledWith('resolve_native_paths', { channel: 'preview' });
});

test('native path errors are not replaced with guessed filesystem locations', async () => {
  Object.defineProperty(globalThis, 'window', { configurable: true, value: { __TAURI_INTERNALS__: {} } });
  nativeInvoke.mockRejectedValue(new Error('Native paths unavailable'));
  await expect(resolveNativePaths('stable')).rejects.toThrow('Native paths unavailable');
});
