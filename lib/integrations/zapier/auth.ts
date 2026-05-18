import { supabaseAdmin } from '@/lib/supabaseClient';

export interface ZapierAuthContext {
  integrationKeyId: string;
  ownerUserId: string;
  allowedWorkspaceIds: string[];
  label?: string | null;
}

interface ZapierWorkspaceKeyRecord {
  id?: string;
  key: string;
  ownerUserId: string;
  allowedWorkspaceIds: string[];
  label?: string | null;
  active?: boolean;
}

const ZAPIER_API_KEYS_ENV = 'ZAPIER_WORKSPACE_API_KEYS';

function parseBearerToken(request: Request): string | null {
  const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
  if (!authHeader) return null;

  const [scheme, token] = authHeader.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token?.trim()) return null;
  return token.trim();
}

function loadWorkspaceKeyRecords(): ZapierWorkspaceKeyRecord[] {
  const raw = process.env[ZAPIER_API_KEYS_ENV];
  if (!raw?.trim()) return [];

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((record): record is ZapierWorkspaceKeyRecord => {
      return Boolean(
        record &&
        typeof record.key === 'string' &&
        typeof record.ownerUserId === 'string' &&
        Array.isArray(record.allowedWorkspaceIds)
      );
    });
  } catch (error) {
    console.error('[ZAPIER_AUTH] Failed to parse workspace API keys config:', error);
    return [];
  }
}

async function verifyWorkspaceOwnership(ownerUserId: string, workspaceId: string): Promise<boolean> {
  if (!supabaseAdmin) {
    throw new Error('Database configuration missing');
  }

  const { data, error } = await supabaseAdmin
    .from('workspaces')
    .select('id')
    .eq('id', workspaceId)
    .eq('user_id', ownerUserId)
    .maybeSingle();

  if (error) {
    console.error('[ZAPIER_AUTH] Workspace ownership lookup failed:', error);
    return false;
  }

  return Boolean(data?.id);
}

export function getZapierWorkspaceApiKeyConfigHint(): string {
  return `${ZAPIER_API_KEYS_ENV} should be a JSON array of { key, ownerUserId, allowedWorkspaceIds[], id?, label?, active? } records.`;
}

export async function authenticateZapierRequest(request: Request): Promise<ZapierAuthContext> {
  const token = parseBearerToken(request);
  if (!token) {
    throw new Error('auth_required');
  }

  const keyRecords = loadWorkspaceKeyRecords();
  const matchedRecord = keyRecords.find((record) => record.key === token && record.active !== false);

  if (!matchedRecord) {
    throw new Error('invalid_api_key');
  }

  return {
    integrationKeyId: matchedRecord.id || matchedRecord.label || 'zapier-key',
    ownerUserId: matchedRecord.ownerUserId,
    allowedWorkspaceIds: matchedRecord.allowedWorkspaceIds,
    label: matchedRecord.label || null,
  };
}

export async function assertZapierWorkspaceAccess(
  auth: ZapierAuthContext,
  workspaceId: string
): Promise<void> {
  if (!workspaceId?.trim()) {
    throw new Error('workspace_required');
  }

  if (!auth.allowedWorkspaceIds.includes(workspaceId)) {
    throw new Error('workspace_not_allowed');
  }

  const ownsWorkspace = await verifyWorkspaceOwnership(auth.ownerUserId, workspaceId);
  if (!ownsWorkspace) {
    throw new Error('workspace_not_allowed');
  }
}
