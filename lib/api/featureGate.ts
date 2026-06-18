/**
 * Feature gate middleware for Enterprise Edition capabilities.
 *
 * Wraps any route handler and ensures the current deployment has an active
 * license that includes the required feature gate. If not, returns a 402
 * with an upgrade hint.
 *
 * Usage:
 *
 *   export const GET = withFeatureGate('sso:saml', async (req, ctx, license) => {
 *     // license is guaranteed to have sso:saml
 *     // ...your SAML endpoint logic
 *   });
 *
 * Feature gates defined in enterprise_licenses:
 *   - sso:saml           SAML/SSO identity provider integration
 *   - rbac               Role-based access control for users
 *   - multi_node         Multi-node Kubernetes clustering
 *   - priority_support   Priority support tier
 */

import { NextRequest, NextResponse } from 'next/server';
import { checkLicense, type ActiveLicense } from '@/lib/api/license';

export type GatedHandler<R> = (
  req: NextRequest,
  ctx: { instanceId: string; params: Record<string, string> },
  license: ActiveLicense
) => Promise<R>;

// Extracts the instance ID from the request. In the Docker appliance model,
// the container sets this via an env var and the gateway reads it.
function resolveInstanceId(req: NextRequest): string | null {
  return (
    req.headers.get('x-lattice-instance') ??
    process.env.LATTICE_INSTANCE_ID ??
    null
  );
}

export function withFeatureGate<R extends Response>(
  requiredGate: string,
  handler: GatedHandler<R>
): (req: NextRequest, ctx: { params: Record<string, string> }) => Promise<NextResponse | R> {
  return async (req, ctx) => {
    const instanceId = resolveInstanceId(req);
    if (!instanceId) {
      return NextResponse.json(
        { error: 'Instance ID not configured', hint: 'Set LATTICE_INSTANCE_ID env var' },
        { status: 500 }
      );
    }

    const license = await checkLicense(instanceId);
    if (!license) {
      return NextResponse.json(
        {
          error: 'No active license found',
          upgrade_url: '/activate-license',
          tier: 'community',
        },
        { status: 402 }
      );
    }

    if (!license.hasFeature(requiredGate)) {
      return NextResponse.json(
        {
          error: `Feature '${requiredGate}' requires Enterprise Edition`,
          upgrade_url: '/pricing',
          current_tier: license.tier,
          available_gates: license.featureGates,
        },
        { status: 402 }
      );
    }

    if (license.isExpired()) {
      return NextResponse.json(
        { error: 'License expired', expired_at: license.expiresAt?.toISOString() },
        { status: 402 }
      );
    }

    return handler(req, { instanceId, params: ctx.params }, license);
  };
}
