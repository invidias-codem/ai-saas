// lib/security/guest.ts
// Helper for reading the guest_id set by proxy.ts middleware.
// Priority: x-guest-id header (most reliable, set by middleware) > cookie fallback.

const GUEST_COOKIE = 'guest_id';

export function getGuestIdFromHeaders(headers: Headers): string | null {
    // 1. Header injected by proxy.ts middleware (most reliable)
    const headerGuest = headers.get('x-guest-id');
    if (headerGuest) return headerGuest;

    // 2. Cookie fallback (for non-middleware contexts, e.g. tests)
    const cookieHeader = headers.get('cookie');
    if (!cookieHeader) return null;
    const match = cookieHeader.match(/[;\s]guest_id=([^;]+)/);
    if (!match) return null;
    return decodeURIComponent(match[1]);
}

export function getRateLimitKey(headers: Headers, route: 'conversation' | 'code' | 'memory'): string {
    const guestId = getGuestIdFromHeaders(headers);
    if (!guestId) throw new Error('No guest ID available for rate limiting');
    // Use guest_id directly as the rate-limit key so limits survive IP changes
    // (mobile users, NATs, etc.). Guest sessions are already ephemeral (24h TTL).
    return `guest:${route}:${guestId}`;
}
