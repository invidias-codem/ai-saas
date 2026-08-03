import { supabaseAdmin } from '@/lib/supabaseClient';

export type ProviderName = 'openai' | 'anthropic' | 'google' | 'openrouter';

export type ProviderApiKeys = Partial<Record<ProviderName, string>>;

export type ProviderKeyStatus = Record<ProviderName, {
  configured: boolean;
  preview: string | null;
  updatedAt: string | null;
}>;

const PROVIDERS: ProviderName[] = ['openai', 'anthropic', 'google', 'openrouter'];

export function isProviderName(provider: string): provider is ProviderName {
  return PROVIDERS.includes(provider as ProviderName);
}

export function maskProviderKey(apiKey: string | null | undefined): string | null {
  if (!apiKey) return null;
  if (apiKey.startsWith('sk-proj-') && apiKey.length > 16) {
    return `${apiKey.slice(0, 7)}...${apiKey.slice(-4)}`;
  }
  if (apiKey.startsWith('sk-ant-') && apiKey.length > 14) {
    return `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`;
  }
  if (apiKey.startsWith('AIza') && apiKey.length > 12) {
    return `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}`;
  }
  if (apiKey.startsWith('sk-or-v1-') && apiKey.length > 14) {
    return `${apiKey.slice(0, 9)}...${apiKey.slice(-4)}`;
  }
  if (apiKey.startsWith('sk-') && apiKey.length > 12) {
    return `${apiKey.slice(0, 5)}...${apiKey.slice(-4)}`;
  }
  return 'configured';
}

export function emptyProviderKeyStatus(): ProviderKeyStatus {
  return {
    openai: { configured: false, preview: null, updatedAt: null },
    anthropic: { configured: false, preview: null, updatedAt: null },
    google: { configured: false, preview: null, updatedAt: null },
    openrouter: { configured: false, preview: null, updatedAt: null },
  };
}

export async function getConfiguredProviderKeys(userId: string): Promise<ProviderKeyStatus> {
  const statuses = emptyProviderKeyStatus();
  if (!supabaseAdmin) return statuses;

  const { data, error } = await supabaseAdmin
    .from('user_provider_api_keys')
    .select('provider, secret_preview, updated_at')
    .eq('user_id', userId)
    .order('provider', { ascending: true });

  if (error) {
    // Backward compatibility during rollout: if the migration has not landed yet,
    // don't fail Settings; just report no configured user provider keys.
    console.warn('[USER_PROVIDER_KEYS_STATUS]', error);
    return statuses;
  }

  for (const row of data ?? []) {
    const provider = row.provider as string;
    if (!isProviderName(provider)) continue;
    statuses[provider] = {
      configured: true,
      preview: row.secret_preview ?? 'configured',
      updatedAt: row.updated_at ?? null,
    };
  }

  return statuses;
}

export async function getUserProviderApiKeys(userId: string): Promise<ProviderApiKeys> {
  if (!supabaseAdmin) return {};

  const { data, error } = await supabaseAdmin.rpc('get_user_provider_api_keys', {
    p_user_id: userId,
  });

  if (error) {
    console.warn('[USER_PROVIDER_KEYS_DECRYPT]', error);
    return {};
  }

  const keys: ProviderApiKeys = {};
  for (const row of data ?? []) {
    const provider = row.provider as string;
    const apiKey = row.api_key as string | null;
    if (isProviderName(provider) && apiKey) {
      keys[provider] = apiKey;
    }
  }

  return keys;
}

export async function upsertUserProviderApiKey(input: {
  userId: string;
  provider: ProviderName;
  apiKey: string;
}): Promise<void> {
  const { userId, provider, apiKey } = input;
  if (!supabaseAdmin) throw new Error('Supabase Admin not configured');

  const { error } = await supabaseAdmin.rpc('upsert_user_provider_api_key', {
    p_user_id: userId,
    p_provider: provider,
    p_api_key: apiKey,
    p_secret_preview: maskProviderKey(apiKey),
  });

  if (error) throw error;
}

export async function deleteUserProviderApiKey(userId: string, provider: ProviderName): Promise<void> {
  if (!supabaseAdmin) throw new Error('Supabase Admin not configured');

  const { error } = await supabaseAdmin.rpc('delete_user_provider_api_key', {
    p_user_id: userId,
    p_provider: provider,
  });

  if (error) throw error;
}
