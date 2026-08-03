/**
 * Native secret hydration for provider API keys.
 *
 * In Tauri/native mode, this can load secrets from Stronghold and merge them
 * into the existing provider-key shape so resolvers don't need to branch.
 */

import { ProviderApiKeys } from '@/lib/userProviderKeys';
import { createSecretStore } from '@/lib/native/secretStore';

export async function hydrateNativeProviderKeys(providerKeys: ProviderApiKeys): Promise<ProviderApiKeys> {
  try {
    const store = await createSecretStore();
    const openrouterKey = await store.getSecret('openrouter_api_key');
    if (openrouterKey) {
      return { ...providerKeys, openrouter: openrouterKey };
    }
  } catch (err) {
    console.warn('[nativeSecrets] hydration skipped:', err);
  }
  return providerKeys;
}
