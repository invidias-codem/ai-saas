/**
 * Slack Integration - Bot commands and notifications
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import axios from 'axios';
import { SlackIntegration } from './schemas';

const SLACK_API_BASE = 'https://slack.com/api';

/**
 * HTTP Cloud Function - Handle Slack Commands (/genie)
 */
export const handleSlackCommand = functions.https.onRequest(async (req, res) => {
  try {
    // Verify Slack signature
    if (!verifySlackSignature(req)) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { user_id, channel_id, text, response_url, team_id } = req.body;

    if (!user_id || !channel_id) {
      res.status(400).json({ error: 'Missing required Slack fields' });
      return;
    }

    // Acknowledge command immediately
    res.status(200).json({
      response_type: 'in_channel',
      text: `Processing your request: "${text}"`,
    });

    // Process command asynchronously
    await processSlackCommand(user_id, channel_id, text, response_url, team_id);
  } catch (error) {
    console.error('Error handling Slack command:', error);
    res.status(500).json({ error: `Failed to process command: ${error}` });
  }
});

/**
 * HTTP Cloud Function - Handle Slack Interactivity (buttons, etc.)
 */
export const handleSlackInteractivity = functions.https.onRequest(
  async (req, res) => {
    try {
      // Verify Slack signature
      if (!verifySlackSignature(req)) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const payload = JSON.parse(req.body.payload || '{}');
      const { type, user, trigger_id, response_url } = payload;

      res.status(200).json({ ok: true });

      // Process interaction asynchronously
      if (type === 'block_actions') {
        await handleBlockActions(payload);
      }
    } catch (error) {
      console.error('Error handling Slack interactivity:', error);
      res.status(500).json({ error: `Failed to handle interaction: ${error}` });
    }
  }
);

/**
 * Process Slack command
 */
async function processSlackCommand(
  userId: string,
  channelId: string,
  text: string,
  responseUrl: string,
  teamId?: string
): Promise<void> {
  try {
    const db = admin.firestore();

    // Parse command: /genie [action] [args...]
    const parts = text.trim().split(/\s+/);
    const action = parts[0] || 'help';

    let response: Record<string, any>;

    switch (action.toLowerCase()) {
      case 'help':
        response = getHelpMessage();
        break;

      case 'memory':
        response = await getMemorySummary(userId);
        break;

      case 'stats':
        response = await getUserStats(userId);
        break;

      case 'notify':
        response = await configureNotifications(userId, channelId);
        break;

      default:
        response = {
          text: `Unknown command: ${action}. Type \`/genie help\` for available commands.`,
        };
    }

    // Send response to Slack
    await axios.post(responseUrl, response);
  } catch (error) {
    console.error('Error processing Slack command:', error);

    // Send error message
    try {
      await axios.post(responseUrl, {
        text: `Error processing command: ${error}`,
      });
    } catch (err) {
      console.error('Failed to send error message to Slack:', err);
    }
  }
}

/**
 * Handle Slack block actions (button clicks, etc.)
 */
async function handleBlockActions(payload: Record<string, any>): Promise<void> {
  const { actions, user, trigger_id } = payload;

  for (const action of actions) {
    const { action_id, value } = action;

    if (action_id === 'view_memory') {
      // TODO: Send modal with memory details
      console.log(`User ${user.id} requested to view memory: ${value}`);
    } else if (action_id === 'enable_notifications') {
      // TODO: Enable notifications
      console.log(`User ${user.id} enabled notifications`);
    }
  }
}

/**
 * Get help message
 */
function getHelpMessage(): Record<string, any> {
  return {
    response_type: 'ephemeral',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Genie AI Slack Commands*\n\n`/genie help` - Show this help message\n`/genie memory` - View your memory summary\n`/genie stats` - Get your usage statistics\n`/genie notify` - Configure notifications',
        },
      },
    ],
  };
}

/**
 * Get user memory summary
 */
async function getMemorySummary(userId: string): Promise<Record<string, any>> {
  try {
    const db = admin.firestore();

    const memories = await db
      .collection('users')
      .doc(userId)
      .collection('memories')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();

    if (memories.empty) {
      return {
        response_type: 'ephemeral',
        text: 'No memories found. Start using Genie to build your knowledge base!',
      };
    }

    const memoryList = memories.docs
      .map((doc) => {
        const memory = doc.data();
        return `• *${memory.title}* (${memory.featureType})\n  ${memory.summary}`;
      })
      .join('\n');

    return {
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Your Recent Memories*\n\n${memoryList}`,
          },
        },
      ],
    };
  } catch (error) {
    console.error('Error getting memory summary:', error);
    return {
      text: 'Error retrieving memories',
    };
  }
}

/**
 * Get user statistics
 */
async function getUserStats(userId: string): Promise<Record<string, any>> {
  try {
    const db = admin.firestore();

    const context = await db
      .collection('users')
      .doc(userId)
      .collection('context')
      .doc('profile')
      .get();

    if (!context.exists) {
      return { text: 'No usage data found' };
    }

    const data = context.data();
    const totalInteractions = data?.totalInteractions || 0;
    const totalTokens = data?.totalTokensUsed || 0;

    return {
      response_type: 'ephemeral',
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Your Genie Stats*\n\n📊 Total Interactions: ${totalInteractions}\n🔤 Total Tokens Used: ${totalTokens}\n⏰ Member Since: ${new Date(data?.createdAt).toLocaleDateString()}`,
          },
        },
      ],
    };
  } catch (error) {
    console.error('Error getting user stats:', error);
    return { text: 'Error retrieving statistics' };
  }
}

/**
 * Configure notifications
 */
async function configureNotifications(
  userId: string,
  channelId: string
): Promise<Record<string, any>> {
  try {
    const db = admin.firestore();

    // Update user context
    await db
      .collection('users')
      .doc(userId)
      .collection('context')
      .doc('profile')
      .update({
        'integrations.slackEnabled': true,
        'integrations.slackChannelId': channelId,
        'integrations.slackUserId': userId,
      });

    return {
      response_type: 'ephemeral',
      text: '✅ Notifications enabled! You will receive updates in this channel.',
    };
  } catch (error) {
    console.error('Error configuring notifications:', error);
    return { text: 'Error configuring notifications' };
  }
}

/**
 * Send Slack notification
 */
export async function sendSlackNotification(
  userId: string,
  message: string,
  blocks?: Record<string, any>[]
): Promise<void> {
  try {
    const db = admin.firestore();

    // Get Slack configuration
    const context = await db
      .collection('users')
      .doc(userId)
      .collection('context')
      .doc('profile')
      .get();

    const slackConfig = context.data()?.integrations;

    if (!slackConfig?.slackEnabled || !slackConfig?.slackChannelId) {
      console.log(`Slack notifications not configured for user ${userId}`);
      return;
    }

    const botToken = process.env.SLACK_BOT_TOKEN;
    if (!botToken) {
      throw new Error('SLACK_BOT_TOKEN not configured');
    }

    // Send message via Slack API
    const payload: Record<string, any> = {
      channel: slackConfig.slackChannelId,
      text: message,
    };

    if (blocks) {
      payload.blocks = blocks;
    }

    await axios.post(`${SLACK_API_BASE}/chat.postMessage`, payload, {
      headers: {
        Authorization: `Bearer ${botToken}`,
        'Content-Type': 'application/json',
      },
    });

    console.log(`Slack notification sent to user ${userId}`);
  } catch (error) {
    console.error(`Error sending Slack notification: ${error}`);
    // Don't throw - notification failure shouldn't block operations
  }
}

/**
 * Verify Slack request signature
 */
function verifySlackSignature(req: functions.https.Request): boolean {
  try {
    const crypto = require('crypto');
    const signingSecret = process.env.SLACK_SIGNING_SECRET || '';
    const timestamp = req.headers['x-slack-request-timestamp'] as string;
    const signature = req.headers['x-slack-signature'] as string;

    // Check timestamp is recent (within 5 minutes)
    const currentTime = Math.floor(Date.now() / 1000);
    if (Math.abs(currentTime - parseInt(timestamp)) > 300) {
      return false;
    }

    // Verify signature
    const baseString = `v0:${timestamp}:${JSON.stringify(req.body)}`;
    const hmac = crypto
      .createHmac('sha256', signingSecret)
      .update(baseString)
      .digest('hex');
    const expectedSignature = `v0=${hmac}`;

    return signature === expectedSignature;
  } catch (error) {
    console.error('Error verifying Slack signature:', error);
    return false;
  }
}
