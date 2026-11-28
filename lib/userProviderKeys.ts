import { supabaseAdmin } from '@/lib/supabaseClient';

export type ProviderName = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'nous' | 'huggingface' | 'deepseek';

export type ProviderApiKeys = Partial<Record<ProviderName, string>>;

export type ProviderKeyStatus = Record<ProviderName, {
  configured: boolean;
  preview: string | null;
  updatedAt: string | null;
}>;

const PROVIDERS: ProviderName[] = ['openai', 'anthropic', 'google', 'openrouter', 'nous', 'huggingface', 'deepseek'];

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
  if (apiKey.startsWith('hf_') && apiKey.length > 10) {
    return `${apiKey.slice(0, 6)}...${apiKey.slice(-4)}`;
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
    nous: { configured: false, preview: null, updatedAt: null },
    huggingface: { configured: false, preview: null, updatedAt: null },
    deepseek: { configured: false, preview: null, updatedAt: null },
  };
}

// ── Guest / platform-fallback contract ──────────────────────────────

export interface ResolvedProviderKeys {
  keys: Record<ProviderName, string>;
  source: 'user_custom' | 'platform_default';
  isGuest: boolean;
}

const ENV_FALLBACK_MAP: Partial<Record<ProviderName, string>> = {
  google: process.env.GOOGLE_API_KEY || '',
  nous: process.env.NOUSE_API_KEY || '',
  openrouter: process.env.OPENROUTER_API_KEY || '',
  huggingface: process.env.HUGGINGFACE_API_KEY || '',
  deepseek: process.env.DEEPSEEK_API_KEY || '',
  anthropic: process.env.ANTHROPIC_API_KEY || '',
  openai: process.env.OPENAI_API_KEY || '',
};

/**
 * Return the effective provider keys for a request.
 *
 * Resolution order:
 *  1. If userId is provided, query the `user_provider_api_keys` RPC.
 *  2. If custom keys are found, return them tagged `user_custom`.
 *  3. Otherwise fall back to platform environment variables tagged `platform_default`.
 *
 * Guests pass no userId (or `null`), landing directly on step 3.
 * Authenticated users with no custom keys also fall back to env,
 * preserving current behavior for accounts that haven't set keys.
 */
export async function getEffectiveProviderKeys(
  userId?: string | null,
): Promise<ResolvedProviderKeys> {
  const isGuest = !userId;

  // Step 1-2: try user-custom keys when we have a userId
  if (!isGuest && supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin.rpc('get_user_provider_api_keys', {
        p_user_id: userId as string,
      });

      if (!error && data && data.length > 0) {
        const keys: Record<ProviderName, string> = {} as Record<ProviderName, string>;
        for (const row of data) {
          const provider = row.provider as string;
          const apiKey = row.api_key as string | null;
          if (isProviderName(provider) && apiKey) {
            keys[provider] = apiKey;
          }
        }
        if (Object.keys(keys).length > 0) {
          return { keys, source: 'user_custom', isGuest: false };
        }
      }
    } catch (err) {
      console.warn('[USER_PROVIDER_KEYS] user lookup failed, falling back to env:', err);
    }
  }

  // Step 3: platform env fallback (guest path, or authenticated user with no custom keys)
  const keys: Record<ProviderName, string> = {} as Record<ProviderName, string>;
  for (const [provider, envValue] of Object.entries(ENV_FALLBACK_MAP)) {
    if (envValue && isProviderName(provider)) {
      keys[provider] = envValue;
    }
  }

  return { keys, source: 'platform_default', isGuest };
}

// ── Existing exports (unchanged) ────────────────────────────────────

export async function getConfiguredProviderKeys(userId: string): Promise<ProviderKeyStatus> {
  const statuses = emptyProviderKeyStatus();
  if (!supabaseAdmin) return statuses;

  const { data, error } = await supabaseAdmin
    .from('user_provider_api_keys')
    .select('provider, secret_preview, updated_at')
    .eq('user_id', userId)
    .order('provider', { ascending: true });

  if (error) {
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
