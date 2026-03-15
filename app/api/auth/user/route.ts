/**
 * Get current user info
 * 
 * GET /api/auth/user
 * Returns userId and basic user info from Clerk
 */

import { auth, currentUser } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { userId } = await auth();

    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await currentUser();

    return NextResponse.json({
      userId,
      email: user?.primaryEmailAddress?.emailAddress,
      name: user?.fullName,
      imageUrl: user?.imageUrl,
    });
  } catch (error) {
    console.error('[API:AuthUser] Error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch user' },
      { status: 500 }
    );
  }
}
