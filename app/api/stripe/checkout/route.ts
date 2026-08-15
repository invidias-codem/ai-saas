import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', {
  apiVersion: '2026-07-29.dahlia',
});

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const expertPriceId = process.env.STRIPE_EXPERT_PRICE_ID;
    if (!expertPriceId) {
      return NextResponse.json({ error: 'Stripe Expert Price ID not configured' }, { status: 500 });
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card', 'link', 'apple_pay', 'google_pay'],
      line_items: [
        {
          price: expertPriceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: `${appUrl}/onboarding/building?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/pricing`,
      metadata: {
        clerkUserId: userId,
      },
    });

    return NextResponse.json({ url: session.url });
  } catch (error: any) {
    console.error('[Stripe:Checkout] Error:', error);
    return NextResponse.json(
      { error: 'Failed to create checkout session', details: error?.message },
      { status: 500 }
    );
  }
}
