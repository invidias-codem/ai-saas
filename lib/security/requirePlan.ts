// lib/security/requirePlan.ts
// Premium gate: after requireAuth(), call requirePlan() to verify the user
// has an active subscription. Media Studio, Chameleon Consultant, and
// Sovereign Telemetry are gated behind this check.
// Uses the updated subscriptions schema (tier + premium_until).

import { AuthenticationError } from "./apiAuth";
import { hasUnlimitedUsageAccess } from "@/lib/credits";

export class PlanAuthorizationError extends Error {
    constructor(message: string = "Premium plan required") {
        super(message);
        this.name = "PlanAuthorizationError";
    }
}

/**
 * Require an active premium subscription.
 * 
 * Resolution order (matches hasUnlimitedUsageAccess):
 *  1. MASTER_USER_EMAILS / UNLIMITED_USAGE_USER_IDS bypass
 *  2. Enterprise tier (unlimited)
 *  3. Pro tier with premium_until > now
 *
 * @throws PlanAuthorizationError if not entitled
 */
export async function requirePlan(userId: string): Promise<void> {
    const hasAccess = await hasUnlimitedUsageAccess(userId);

    if (!hasAccess) {
        throw new PlanAuthorizationError("Premium plan required");
    }
}
