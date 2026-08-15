import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { supabaseAdmin } from '@/lib/supabaseClient';

function getStripe() {
  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    throw new Error('STRIPE_SECRET_KEY is not configured');
  }
  return new Stripe(apiKey, {
    apiVersion: '2026-07-29.dahlia',
  });
}

export const dynamic = 'force-dynamic';

async function upsertSubscriptionFromCheckout(session: Stripe.Checkout.Session) {
  if (!supabaseAdmin) {
    console.error('[Stripe:Webhook] Supabase admin client not initialized');
    return;
  }

  const clerkUserId = session.metadata?.clerkUserId;
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

  if (!clerkUserId || !customerId || !subscriptionId) {
    console.error('[Stripe:Webhook] Missing required checkout fields', {
      clerkUserId,
      customerId,
      subscriptionId,
    });
    return;
  }

  const stripe = getStripe();
  const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
    expand: ['data.price'],
  });

  const priceId = lineItems.data[0]?.price?.id ?? null;

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .upsert(
      {
        clerk_user_id: clerkUserId,
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId,
        stripe_price_id: priceId,
        stripe_status: session.payment_status === 'paid' ? 'active' : 'incomplete',
        tier: 'pro',
        cancel_at_period_end: false,
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
      {
        onConflict: 'clerk_user_id',
      }
    );

  if (error) {
    console.error('[Stripe:Webhook] Failed to upsert subscription:', error);
    return;
  }

  console.log(`[Stripe:Webhook] Unlocked expert access for ${clerkUserId}`);
}

async function markSubscriptionCancelled(subscriptionId: string) {
  if (!supabaseAdmin) {
    console.error('[Stripe:Webhook] Supabase admin client not initialized');
    return;
  }

  const { error } = await supabaseAdmin
    .from('subscriptions')
    .update({
      stripe_status: 'canceled',
      tier: 'free',
      cancel_at_period_end: true,
    })
    .eq('stripe_subscription_id', subscriptionId);

  if (error) {
    console.error('[Stripe:Webhook] Failed to cancel subscription:', error);
  } else {
    console.log(`[Stripe:Webhook] Marked subscription ${subscriptionId} as canceled`);
  }
}

export async function POST(req: NextRequest) {
  try {
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json({ error: 'Stripe webhook secret not configured' }, { status: 500 });
    }

    const rawBody = await req.text();
    const signature = req.headers.get('stripe-signature') ?? '';

    let event: Stripe.Event;
    try {
      const stripe = getStripe();
      event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      console.error('[Stripe:Webhook] Signature verification failed:', err);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.payment_status === 'paid') {
          await upsertSubscriptionFromCheckout(session);
        }
        break;
      }
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        await markSubscriptionCancelled(subscription.id);
        break;
      }
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        if (!supabaseAdmin) break;

        const isActive = subscription.status === 'active';
        const isCanceled = subscription.status === 'canceled' || subscription.status === 'unpaid' || subscription.status === 'incomplete_expired';

        const updatePayload: any = {
          stripe_status: subscription.status,
          cancel_at_period_end: subscription.cancel_at_period_end ?? false,
          current_period_end: (subscription as any).current_period_end
            ? new Date((subscription as any).current_period_end * 1000).toISOString()
            : null,
        };

        if (isCanceled) {
          updatePayload.tier = 'free';
        } else if (isActive) {
          updatePayload.tier = 'pro';
        }

        const { error } = await supabaseAdmin
          .from('subscriptions')
          .update(updatePayload)
          .eq('stripe_subscription_id', subscription.id);

        if (error) {
          console.error('[Stripe:Webhook] Failed to update subscription:', error);
        } else {
          console.log(`[Stripe:Webhook] Updated subscription ${subscription.id} to ${subscription.status}`);
        }
        break;
      }
      default:
        console.log(`[Stripe:Webhook] Unhandled event type: ${event.type}`);
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    console.error('[Stripe:Webhook] Processing error:', error);
    return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
  }
}
