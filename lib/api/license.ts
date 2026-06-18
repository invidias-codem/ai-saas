/**
 * Enterprise license verification for the Docker appliance model.
 *
 * The container ships everything. The license key turns on enterprise features.
 * This module checks whether a workspace/instance is entitled to a given
 * feature (SSO, RBAC, multi-node clustering, priority support).
 *
 * Usage in a feature-gated endpoint:
 *
 *   const license = await checkLicense(instanceId);
 *   if (!license.hasFeature('sso:saml')) {
 *     return NextResponse.json(
 *       { error: 'SAML/SSO requires Enterprise Edition', upgrade_url: '/pricing' },
 *       { status: 402 }
 *     );
 *   }
 *   // ... proceed with SAML endpoint
 *
 * The check is cached per-instance for 60s to avoid hitting the DB on every
 * request. A heartbeat updates last_heartbeat_at every 5 minutes (optional).
 */

import { supabaseAdmin } from '@/lib/supabaseClient';

export type LicenseTier = 'community' | 'enterprise';

export interface ActiveLicense {
  id: string;
  tier: LicenseTier;
  featureGates: string[];
  maxNodes: number;
  maxSeats: number;
  organizationName: string;
  expiresAt: Date | null;
  hasFeature(gate: string): boolean;
  isExpired(): boolean;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { license: ActiveLicense; cachedAt: number }>();

function buildLicense(
  row: {
    id: string;
    tier: string;
    feature_gates: string[];
    max_nodes: number;
    max_seats: number;
    organization_name: string;
    expires_at: string | null;
  }
): ActiveLicense {
  const expiresAt = row.expires_at ? new Date(row.expires_at) : null;
  return {
    id: row.id,
    tier: row.tier as LicenseTier,
    featureGates: row.feature_gates ?? [],
    maxNodes: row.max_nodes,
    maxSeats: row.max_seats,
    organizationName: row.organization_name,
    expiresAt,
    hasFeature(gate: string) {
      // Community always allowed; enterprise requires explicit gate.
      if (this.tier === 'community') return false;
      if (this.isExpired()) return false;
      return this.featureGates.includes(gate);
    },
    isExpired() {
      return !!expiresAt && expiresAt.getTime() < Date.now();
    },
  };
}

/**
 * Resolve the active license for an instance (Docker deployment).
 * Returns null if no license has been activated yet.
 */
export async function checkLicense(instanceId: string): Promise<ActiveLicense | null> {
  const cached = cache.get(instanceId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.license;
  }

  if (!supabaseAdmin) return null;

  const { data: row, error } = await supabaseAdmin
    .from('enterprise_licenses')
    .select('id, tier, feature_gates, max_nodes, max_seats, organization_name, expires_at')
    .eq('instance_id', instanceId)
    .eq('revoked', false)
    .order('activated_at', { ascending: false })
    .limit(1)
    .single();

  if (error || !row) return null;

  const license = buildLicense(row);
  cache.set(instanceId, { license, cachedAt: Date.now() });
  return license;
}

/**
 * Activate a license key on first container boot. Called once when the admin
 * pastes their LATOS-ENT-XXXX key into the onboarding wizard.
 */
export async function activateLicense(
  licenseKeyParam: string,
  instanceId: string
): Promise<{ ok: boolean; error?: string }> {
  if (!supabaseAdmin) return { ok: false, error: 'Backend not configured' };

  const { data, error: selectErr } = await supabaseAdmin
    .from('enterprise_licenses')
    .select('id, instance_id, activated_at, expires_at')
    .eq('license_key', licenseKeyParam)
    .eq('revoked', false)
    .single();

  if (selectErr || !data) return { ok: false, error: 'Invalid or revoked license key' };
  if (data.instance_id && data.instance_id !== instanceId) {
    return { ok: false, error: 'License key already bound to a different instance' };
  }

  const { error: updateErr } = await supabaseAdmin
    .from('enterprise_licenses')
    .update({
      instance_id: instanceId,
      activated_at: data.activated_at ?? new Date().toISOString(),
      last_heartbeat_at: new Date().toISOString(),
    })
    .eq('id', data.id);

  if (updateErr) return { ok: false, error: 'Failed to activate license' };

  cache.clear(); // bust cache so next checkLicense sees fresh state
  return { ok: true };
}

/**
 * Optional heartbeat — containers ping this every 5 minutes when online.
 * Never required for functionality; purely for license hygiene.
 */
export async function heartbeat(instanceId: string): Promise<void> {
  if (!supabaseAdmin) return;
  void supabaseAdmin
    .from('enterprise_licenses')
    .update({ last_heartbeat_at: new Date().toISOString() })
    .eq('instance_id', instanceId)
    .eq('revoked', false);
}
