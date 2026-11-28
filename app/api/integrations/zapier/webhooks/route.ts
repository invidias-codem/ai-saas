import { sanitizeForLog } from '@/lib/security/urlValidator';
import crypto from 'crypto';
/**
 * Zapier Webhook Receiver
 * Receives events triggered from Zapier workflows
 */

import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    // Read raw body BEFORE parsing so we can verify the signature against
    // the exact bytes the sender signed. Parsing first would mutate the
    // stream and invalidate the HMAC.
    const rawBody = await req.text();
    const signature = req.headers.get('x-zapier-signature');
    const webhookSecret = process.env.ZAPIER_WEBHOOK_SECRET;

    if (webhookSecret) {
      if (!signature || !verifyWebhookSignature(rawBody, signature, webhookSecret)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } else if (process.env.NODE_ENV === 'production') {
      // Production MUST have the secret; otherwise any caller can forge requests.
      console.error('[ZAPIER_WEBHOOK] ZAPIER_WEBHOOK_SECRET missing in production');
      return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    let body: Record<string, any>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const { userId, action, data } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId' },
        { status: 400 }
      );
    }

    // Handle different Zapier actions
    switch (action) {
      case 'create_memory':
        // Trigger memory creation
        return await handleCreateMemory(userId, data);

      case 'trigger_conversation':
        // Trigger AI conversation
        return await handleTriggerConversation(userId, data);

      case 'export_memories':
        // Export user memories
        return await handleExportMemories(userId);

      default:
        return NextResponse.json(
          { error: `Unknown action: ${action}` },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('[ZAPIER_WEBHOOK_ERROR]', error);
    return NextResponse.json(
      {
        error: 'Failed to process Zapier webhook',
        details: error.message,
      },
      { status: 500 }
    );
  }
}

/**
 * Handle create memory action
 */
async function handleCreateMemory(
  userId: string,
  data: Record<string, any>
): Promise<NextResponse> {
  try {
    const { title, summary, tags, metadata } = data;

    // TODO: Store memory in Firestore via Cloud Function
    // For now, just log and return success

    console.log(`Memory creation requested for user ${sanitizeForLog(userId)}:`, { title, summary }); // lgtm[js/tainted-format-string]

    return NextResponse.json({
      success: true,
      message: 'Memory creation triggered',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

/**
 * Handle trigger conversation action
 */
async function handleTriggerConversation(
  userId: string,
  data: Record<string, any>
): Promise<NextResponse> {
  try {
    const { prompt } = data;

    // TODO: Trigger conversation API
    // For now, just log and return success

    console.log(`Conversation requested for user ${sanitizeForLog(userId)}:`, prompt);

    return NextResponse.json({
      success: true,
      message: 'Conversation triggered',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

/**
 * Handle export memories action
 */
async function handleExportMemories(userId: string): Promise<NextResponse> {
  try {
    // TODO: Fetch all memories from Firestore and export

    console.log(`Exporting memories for user ${sanitizeForLog(userId)}`);

    return NextResponse.json({
      success: true,
      message: 'Memory export initiated',
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message },
      { status: 500 }
    );
  }
}

/**
 * Verify Zapier webhook signature using HMAC-SHA256 with timing-safe comparison.
 *
 * Zapier typically signs the raw request body as `sha256=<hex_digest>`.
 */
function verifyWebhookSignature(
  rawBody: string,
  signature: string,
  secret: string
): boolean {
  try {
    // Accept both "sha256=..." prefix and raw hex for flexibility.
    const provided = signature.startsWith('sha256=')
      ? signature.slice(7)
      : signature;

    const expected = crypto
      .createHmac('sha256', secret)
      .update(rawBody)
      .digest('hex');

    if (provided.length !== expected.length) return false;

    const providedBuf = Buffer.from(provided, 'hex');
    const expectedBuf = Buffer.from(expected, 'hex');

    return crypto.timingSafeEqual(providedBuf, expectedBuf);
  } catch (error) {
    console.error('[ZAPIER_WEBHOOK] Signature verification error:', error);
    return false;
  }
}
