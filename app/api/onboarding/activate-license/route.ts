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

    const instanceId = process.env.LATTICE_INSTANCE_ID;
    if (!instanceId) {
      return NextResponse.json(
        { error: 'LATTICE_INSTANCE_ID not configured' },
        { status: 500 }
      );
    }

    const result = await activateLicense(licenseKey, instanceId);
    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    const license = await checkLicense(instanceId);
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
