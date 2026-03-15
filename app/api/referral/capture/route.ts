// app/api/referral/capture/route.ts
// Called client-side immediately after Clerk signup.
// Reads the tg_ref cookie and persists it to the user's Supabase profile.

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import {
  captureReferralForUser,
  logReferralEvent,
  hashIP,
  REFERRAL_COOKIE,
  PLATFORM_COOKIE,
} from '@/lib/referral';

export async function POST(req: NextRequest) {
  try {
    // 1. Must be authenticated
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Read referral code from cookie (sent automatically by browser)
    const refCode    = req.cookies.get(REFERRAL_COOKIE)?.value;
    const platform   = req.cookies.get(PLATFORM_COOKIE)?.value || 'direct';

    // Also accept explicit body override (for edge cases)
    let bodyCode: string | undefined;
    try {
      const body = await req.json();
      bodyCode = body.ref;
    } catch { /* no body */ }

    const code = refCode || bodyCode;

    if (!code) {
      // No referral to capture — that's fine, not an error
      return NextResponse.json({ captured: false, reason: 'no_ref_cookie' });
    }

    // 3. Store on user profile (first-touch only)
    const captured = await captureReferralForUser(userId, code);

    if (!captured) {
      return NextResponse.json({ captured: false, reason: 'already_attributed' });
    }

    // 4. Log the signup event
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
            || req.headers.get('x-real-ip')
            || 'unknown';

    await logReferralEvent({
      code,
      eventType: 'signup',
      userId,
      ipHash:    await hashIP(ip),
      platform,
      utmSource: platform,
      metadata: {
        captured_via: 'cookie',
        user_agent: req.headers.get('user-agent') || '',
      },
    });

    console.log(`[Referral] Captured: user=${userId} → code=${code} platform=${platform}`);

    // 5. Clear the referral cookie (one-time capture)
    const res = NextResponse.json({ captured: true, code });
    res.cookies.delete(REFERRAL_COOKIE);
    res.cookies.delete(PLATFORM_COOKIE);
    return res;

  } catch (err) {
    console.error('[Referral Capture] Error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
