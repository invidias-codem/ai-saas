
import { NextResponse } from 'next/server';
import { generateDailyDigest } from '@/lib/retention/digestService';
import { createClerkClient } from '@clerk/nextjs/server';
// We'll trust this runs in a secure environment or verify CRON_SECRET if exposed publically
// Vercel Cron calls this endpoint with an authorization header

const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY });

export async function GET(req: Request) {
    if (process.env.CRON_SECRET && req.headers.get('Authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
        return new NextResponse('Unauthorized', { status: 401 });
    }

    // Allow test overrides
    const { searchParams } = new URL(req.url);
    const testUserId = searchParams.get('userId');
    const testEmail = searchParams.get('email');

    if (testUserId && testEmail) {
        await generateDailyDigest(testUserId, testEmail);
        return NextResponse.json({ success: true, message: `Digest sent to ${testEmail}` });
    }

    try {
        // Fetch list of users from Clerk
        // In production, might want to paginate or filter by last_active_at if available
        const response = await clerk.users.getUserList({
            limit: 100, // Process in batches
        });

        const users = response.data;
        let sentCount = 0;

        console.log(`[DailyDigestCron] Processing ${users.length} users...`);

        // Process in parallel with concurrency limit? Or just Promise.all for MVP
        const results = await Promise.allSettled(users.map(async (user) => {
            const email = user.emailAddresses.find(e => e.id === user.primaryEmailAddressId)?.emailAddress;
            if (!email) return;

            try {
                // Check if user has logged in recently? (Optional optimization)
                if (user.lastSignInAt) {
                    const lastLogin = new Date(user.lastSignInAt);
                    const daysSinceLogin = (Date.now() - lastLogin.getTime()) / (1000 * 60 * 60 * 24);
                    if (daysSinceLogin > 30) {
                        // Skip users inactive for > 30 days
                        return;
                    }
                }

                await generateDailyDigest(user.id, email, user.firstName || 'User');
                sentCount++;
            } catch (err) {
                console.error(`[DailyDigestCron] Failed for user ${user.id}:`, err);
            }
        }));

        return NextResponse.json({
            success: true,
            message: `Digest processing complete. Sent: ${sentCount}/${users.length}`
        });

    } catch (error: any) {
        console.error("[DailyDigestCron] Error:", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
