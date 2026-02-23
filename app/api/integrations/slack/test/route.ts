/**
 * Slack Test Connection Endpoint
 * Sends a test message to verify the integration is working
 */

import { auth } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return new NextResponse('Unauthorized', { status: 401 });
    }

    const botToken = process.env.SLACK_BOT_TOKEN;
    if (!botToken) {
      return NextResponse.json({
        success: false,
        error: 'Slack bot token not configured',
      });
    }

    // First, get the bot's user ID to find DM channel
    const authResponse = await fetch('https://slack.com/api/auth.test', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
    });

    const authData = await authResponse.json();
    if (!authData.ok) {
      return NextResponse.json({
        success: false,
        error: `Auth failed: ${authData.error}`,
      });
    }

    // Try to get the body for channel specification
    let targetChannel: string | null = null;
    try {
      const body = await req.json();
      targetChannel = body.channel;
    } catch {
      // No body provided, will use default behavior
    }

    // If no channel specified, try to find a general channel or use the bot's own channel
    if (!targetChannel) {
      // List channels to find #general or first available
      const channelsResponse = await fetch('https://slack.com/api/conversations.list?types=public_channel&limit=10', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${botToken}`,
        },
      });

      const channelsData = await channelsResponse.json();
      if (channelsData.ok && channelsData.channels?.length > 0) {
        // Try to find #general, otherwise use first channel
        const generalChannel = channelsData.channels.find(
          (c: any) => c.name === 'general' || c.name === 'random'
        );
        targetChannel = generalChannel?.id || channelsData.channels[0].id;
      }
    }

    if (!targetChannel) {
      return NextResponse.json({
        success: false,
        error: 'No channel available. Please invite the bot to a channel first.',
      });
    }

    // Send test message
    const messageResponse = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        channel: targetChannel,
        text: '🧞 *Genie AI Test Message*',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '🧞 *Genie AI is connected!*\n\nYour Slack integration is working correctly.',
            },
          },
          {
            type: 'divider',
          },
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: '*Try these commands:*\n• `/genie help` - See all commands\n• `/genie ask [question]` - Ask me anything\n• `@Genie [message]` - Mention me in any channel',
            },
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `✅ Test sent at ${new Date().toLocaleString()}`,
              },
            ],
          },
        ],
      }),
    });

    const messageData = await messageResponse.json();

    if (messageData.ok) {
      return NextResponse.json({
        success: true,
        message: 'Test message sent successfully',
        channel: messageData.channel,
        timestamp: messageData.ts,
      });
    } else {
      return NextResponse.json({
        success: false,
        error: `Failed to send message: ${messageData.error}`,
      });
    }
  } catch (error: any) {
    console.error('[SLACK_TEST_ERROR]', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Failed to test Slack connection',
    });
  }
}
