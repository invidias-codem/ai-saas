import { invoke } from '@tauri-apps/api/core';
import { credentialBroker } from './credential-broker-client';

jest.mock('@tauri-apps/api/core', () => ({ invoke: jest.fn() }));
const nativeInvoke = jest.mocked(invoke);

beforeEach(() => nativeInvoke.mockReset());

test('API-key storage sends the camelCase arguments consumed by Tauri', async () => {
  const reference = { id: 'openai:api-key:connection-a', label: 'Test', createdAt: '2026-10-31T00:00:00Z', updatedAt: '2026-10-31T00:00:00Z', metadata: {} };
  nativeInvoke.mockResolvedValue({ status: 'ok', reference });
  await expect(credentialBroker.storeApiKey('openai', 'synthetic test value', 'Test', {}, 'connection-a')).resolves.toEqual(reference);
  expect(nativeInvoke).toHaveBeenCalledWith('credential_store_api_key', { provider: 'openai', apiKey: 'synthetic test value', label: 'Test', metadata: {}, suffix: 'connection-a' });
});

test('local endpoint configuration uses the same native argument convention', async () => {
  nativeInvoke.mockResolvedValue({ status: 'ok', reference: { id: 'local:local-endpoint:local-a' } });
  await credentialBroker.storeLocalEndpoint('local', 'http://127.0.0.1:8000/v1', 'example-model', 'Local model', 'local-a');
  expect(nativeInvoke).toHaveBeenCalledWith('credential_store_local_endpoint', { provider: 'local', endpointUrl: 'http://127.0.0.1:8000/v1', modelId: 'example-model', label: 'Local model', suffix: 'local-a' });
});

test('native storage errors reach callers without becoming successful empty results', async () => {
  nativeInvoke.mockResolvedValue({ status: 'error', code: 'STORE_UNAVAILABLE', message: 'Keyring is unavailable' });
  await expect(credentialBroker.listProviderCredentials('openai')).rejects.toThrow('STORE_UNAVAILABLE');
});
