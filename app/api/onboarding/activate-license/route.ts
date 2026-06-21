/**
 * POST /api/onboarding/activate-license
 *
 * Called by the Docker onboarding wizard when the admin pastes their license
 * key. Binds the license to this instance so feature gates start working.
 *
 * Body: { licenseKey: "LATOS-ENT-XXXX-XXXX-XXXX" }
 *
 * Returns the activated license details (tier, features, max nodes/seats)
 * so the wizard can immediately show the user what's unlocked.
 */

import { NextRequest, NextResponse } from 'next/server';
import { activateLicense, checkLicense } from '@/lib/api/license';
import { audit } from '@/lib/security/auditLog';
import { env } from '@/lib/env';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const licenseKey = body?.licenseKey;
    if (!licenseKey || typeof licenseKey !== 'string') {
      return NextResponse.json(
        { error: 'licenseKey is required' },
        { status: 400 }
      );
    }

    const instanceId = env.LATTICE_INSTANCE_ID;
    if (!instanceId) {
      return NextResponse.json(
        { error: 'LATTICE_INSTANCE_ID not configured' },
        { status: 500 }
      );
    }

    void audit('license.activation_attempt', 'system', {
      instanceId,
      licenseKey,
    }, req);

    const result = await activateLicense(licenseKey, instanceId);
    if (!result.ok) {
      void audit('license.activation_failed', 'system', {
        instanceId,
        licenseKey,
        reason: result.error,
      }, req);
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const license = await checkLicense(instanceId);
    void audit('license.activation_success', 'system', {
      instanceId,
      licenseId: license?.id,
      tier: license?.tier,
      maxSeats: license?.maxSeats,
      maxNodes: license?.maxNodes,
    }, req);

    return NextResponse.json({
      success: true,
      license: license
        ? {
            tier: license.tier,
            features: license.featureGates,
            maxNodes: license.maxNodes,
            maxSeats: license.maxSeats,
            organization: license.organizationName,
            expiresAt: license.expiresAt,
          }
        : null,
    });
  } catch (err) {
    console.error('[activate-license]', err);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
