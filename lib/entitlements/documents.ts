import { User } from '@clerk/nextjs/server';

export interface EntitlementResult {
  allowed: boolean;
  reason?: string;
  message?: string;
  ctaHref?: string;
  ctaLabel?: string;
}

export function checkDocumentEntitlement(user: User, computeCredits: number): EntitlementResult {
  const plan = user.privateMetadata?.plan as string | undefined;
  const isPremium = plan === 'premium' || plan === 'pro';
  const hasCredits = computeCredits > 0;

  if (isPremium || hasCredits) {
    return { allowed: true };
  }

  return {
    allowed: false,
    reason: 'premium_feature_required',
    message: 'Document uploads and deep-dive previews require an active plan or compute credits.',
    ctaLabel: 'Support Lattice / Unlock advanced features',
    ctaHref: '/support'
  };
}
