import { sanitizeForLog } from '@/lib/security/urlValidator';
/**
 * Zapier Webhook Receiver
 * Receives events triggered from Zapier workflows
 */

import { NextResponse } from 'next/server';
import axios from 'axios';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { userId, action, data } = body;

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId' },
        { status: 400 }
      );
    }

    // Verify webhook signature when secret is configured
    const webhookSecret = process.env.ZAPIER_WEBHOOK_SECRET;
    if (webhookSecret) {
      const signature = req.headers.get('x-zapier-signature');
      if (!signature || !verifyWebhookSignature(req, signature)) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
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

    console.log(`Memory creation requested for user ${sanitizeForLog(userId)}:`, // lgtm[js/tainted-format-string] {
      title,
      summary,
    });

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
 * Verify Zapier webhook signature
 */
function verifyWebhookSignature(
  req: Request,
  signature: string
): boolean {
  try {
    // Implement signature verification based on Zapier's signing method
    // This is a placeholder implementation
    const crypto = require('crypto');
    const secret = process.env.ZAPIER_WEBHOOK_SECRET || '';

    // TODO: Implement actual verification logic
    return true;
  } catch (error) {
    console.error('Error verifying webhook signature:', error);
    return false;
  }
}
