/**
 * Slack Interactivity Handler (Multi-Tenant)
 * Handles button clicks, menu selections, and modal submissions from ANY workspace
 * 
 * This endpoint receives interaction payloads from all installed workspaces.
 * It dynamically resolves the correct bot token for each workspace
 * using the team.id from the interaction payload.
 * 
 * Supported interaction types:
 * - block_actions: Button clicks, menu selections
 * - view_submission: Modal form submissions
 * - shortcut: Global and message shortcuts
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { getSlackConfig, SlackConfig } from '@/lib/slack/tokenManager';
import * as admin from 'firebase-admin';

// Initialize Firebase Admin with proper credentials
function initializeFirebaseAdmin() {
  if (admin.apps.length > 0) {
    return admin.app();
  }

  const serviceAccountJson = process.env.GCP_SERVICE_ACCOUNT_KEY_JSON;
  
  if (serviceAccountJson) {
    try {
      const serviceAccount = JSON.parse(serviceAccountJson);
      return admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: serviceAccount.project_id,
      });
    } catch (error) {
      console.error('[SLACK_INTERACTIVITY] Failed to parse service account JSON:', error);
    }
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GOOGLE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    return admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey,
      }),
      projectId,
    });
  }

  return admin.initializeApp({
    credential: admin.credential.applicationDefault(),
  });
}

const firebaseApp = initializeFirebaseAdmin();
const db = admin.firestore();
const SLACK_API_BASE = 'https://slack.com/api';

// Initialize Gemini for regenerate functionality
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');
const model = genAI.getGenerativeModel({
  model: "gemini-2.0-flash",
  safetySettings: [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  ],
});

/**
 * Verify Slack request signature
 */
function verifySlackSignature(
  body: string,
  timestamp: string,
  signature: string
): boolean {
  const signingSecret = process.env.SLACK_SIGNING_SECRET || '';

  const currentTime = Math.floor(Date.now() / 1000);
  if (Math.abs(currentTime - parseInt(timestamp)) > 300) {
    return false;
  }

  const baseString = `v0:${timestamp}:${body}`;
  const hmac = crypto
    .createHmac('sha256', signingSecret)
    .update(baseString)
    .digest('hex');
  const expectedSignature = `v0=${hmac}`;

  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  } catch {
    return false;
  }
}

/**
 * Update a message via response_url
 */
async function updateMessageViaResponseUrl(
  responseUrl: string,
  payload: {
    text?: string;
    blocks?: any[];
    replace_original?: boolean;
    delete_original?: boolean;
    response_type?: 'in_channel' | 'ephemeral';
  }
): Promise<void> {
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    console.error('[SLACK_INTERACTIVITY] Failed to update message:', error);
  }
}

/**
 * Send a message to Slack
 */
async function sendSlackMessage(
  token: string,
  channel: string,
  text: string,
  blocks?: any[],
  threadTs?: string
): Promise<{ ok: boolean; ts?: string; error?: string }> {
  const payload: Record<string, any> = {
    channel,
    text,
    mrkdwn: true,
  };

  if (blocks) {
    payload.blocks = blocks;
  }

  if (threadTs) {
    payload.thread_ts = threadTs;
  }

  const response = await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  return response.json();
}

/**
 * Open a modal in Slack
 */
async function openModal(
  token: string,
  triggerId: string,
  view: any
): Promise<{ ok: boolean; error?: string }> {
  const response = await fetch(`${SLACK_API_BASE}/views.open`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      trigger_id: triggerId,
      view,
    }),
  });

  return response.json();
}

/**
 * Store feedback in Firestore
 */
async function storeFeedback(
  teamId: string,
  userId: string,
  messageTs: string,
  feedbackType: 'helpful' | 'not_helpful',
  context?: string
): Promise<void> {
  try {
    await db.collection('slackFeedback').add({
      teamId,
      userId,
      messageTs,
      feedbackType,
      context,
      timestamp: Date.now(),
    });
    console.log('[SLACK_INTERACTIVITY] Stored feedback:', { teamId, feedbackType });
  } catch (error) {
    console.error('[SLACK_INTERACTIVITY] Failed to store feedback:', error);
  }
}

/**
 * Generate AI response using Gemini
 */
async function generateGenieResponse(prompt: string): Promise<string> {
  try {
    const result = await model.generateContent(prompt);
    return result.response.text();
  } catch (error) {
    console.error('[SLACK_INTERACTIVITY] Error generating response:', error);
    return "I apologize, but I encountered an error. Please try again.";
  }
}

/**
 * Handle block_actions (button clicks, menu selections)
 */
async function handleBlockActions(
  config: SlackConfig,
  payload: any
): Promise<void> {
  const { actions, user, channel, message, response_url, trigger_id } = payload;

  for (const action of actions) {
    const { action_id, value, block_id } = action;

    console.log('[SLACK_INTERACTIVITY] Processing action:', {
      teamId: config.teamId,
      actionId: action_id,
      userId: user?.id,
      value,
    });

    switch (action_id) {
      // ─────────────────────────────────────────────────────────────────
      // Feedback Actions
      // ─────────────────────────────────────────────────────────────────
      case 'feedback_helpful':
        await storeFeedback(
          config.teamId,
          user.id,
          message?.ts || '',
          'helpful',
          value
        );
        
        // Update the message to show feedback received
        if (response_url) {
          await updateMessageViaResponseUrl(response_url, {
            text: message?.text || '',
            blocks: [
              ...(message?.blocks?.filter((b: any) => b.type !== 'actions') || []),
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: '✅ _Thanks for your feedback!_',
                  },
                ],
              },
            ],
            replace_original: true,
          });
        }
        break;

      case 'feedback_not_helpful':
        await storeFeedback(
          config.teamId,
          user.id,
          message?.ts || '',
          'not_helpful',
          value
        );
        
        // Update the message to show feedback received
        if (response_url) {
          await updateMessageViaResponseUrl(response_url, {
            text: message?.text || '',
            blocks: [
              ...(message?.blocks?.filter((b: any) => b.type !== 'actions') || []),
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: '📝 _Thanks for your feedback! We\'ll work on improving._',
                  },
                ],
              },
            ],
            replace_original: true,
          });
        }
        break;

      // ─────────────────────────────────────────────────────────────────
      // Regenerate Response
      // ─────────────────────────────────────────────────────────────────
      case 'regenerate_response':
        if (response_url && value) {
          // Show loading state
          await updateMessageViaResponseUrl(response_url, {
            text: '🔄 Regenerating response...',
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '🔄 _Regenerating response..._',
                },
              },
            ],
            replace_original: true,
          });

          // Generate new response
          const newResponse = await generateGenieResponse(value);

          // Update with new response
          await updateMessageViaResponseUrl(response_url, {
            text: newResponse,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `🧞 *Genie:*\n${newResponse}`,
                },
              },
              {
                type: 'actions',
                elements: [
                  {
                    type: 'button',
                    text: { type: 'plain_text', text: '👍', emoji: true },
                    action_id: 'feedback_helpful',
                    value: value,
                  },
                  {
                    type: 'button',
                    text: { type: 'plain_text', text: '👎', emoji: true },
                    action_id: 'feedback_not_helpful',
                    value: value,
                  },
                  {
                    type: 'button',
                    text: { type: 'plain_text', text: '🔄 Regenerate', emoji: true },
                    action_id: 'regenerate_response',
                    value: value,
                  },
                ],
              },
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: '_Response regenerated_',
                  },
                ],
              },
            ],
            replace_original: true,
          });
        }
        break;

      // ──────────────────────────────────────────���──────────────────────
      // Expand/Show More
      // ─────────────────────────────────────────────────────────────────
      case 'expand_response':
        if (response_url && value) {
          // Show loading state
          await updateMessageViaResponseUrl(response_url, {
            text: '📖 Expanding response...',
            blocks: [
              ...(message?.blocks?.filter((b: any) => b.type !== 'actions') || []),
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '📖 _Expanding response..._',
                },
              },
            ],
            replace_original: true,
          });

          // Generate expanded response
          const expandedPrompt = `Please provide a more detailed and comprehensive explanation of the following topic. Include examples, use cases, and any relevant details: ${value}`;
          const expandedResponse = await generateGenieResponse(expandedPrompt);

          // Update with expanded response
          await updateMessageViaResponseUrl(response_url, {
            text: expandedResponse,
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `📖 *Expanded Response:*\n${expandedResponse}`,
                },
              },
              {
                type: 'actions',
                elements: [
                  {
                    type: 'button',
                    text: { type: 'plain_text', text: '👍', emoji: true },
                    action_id: 'feedback_helpful',
                    value: value,
                  },
                  {
                    type: 'button',
                    text: { type: 'plain_text', text: '👎', emoji: true },
                    action_id: 'feedback_not_helpful',
                    value: value,
                  },
                ],
              },
            ],
            replace_original: true,
          });
        }
        break;

      // ─────────────────────────────────────────────────────────────────
      // Save to Memory
      // ─────────────────────────────────────────────────────────────────
      case 'save_to_memory':
        if (value) {
          try {
            // Store in user's memory collection
            await db
              .collection('slackMemories')
              .add({
                teamId: config.teamId,
                userId: user.id,
                content: value,
                source: 'slack_interaction',
                messageTs: message?.ts,
                channelId: channel?.id,
                timestamp: Date.now(),
              });

            if (response_url) {
              await updateMessageViaResponseUrl(response_url, {
                text: '💾 Saved to memory!',
                response_type: 'ephemeral',
                replace_original: false,
              });
            }
          } catch (error) {
            console.error('[SLACK_INTERACTIVITY] Failed to save to memory:', error);
          }
        }
        break;

      // ─────────────────────────────────────────────────────────────────
      // Open Settings Modal
      // ─────────────────────────────────────────────────────────────────
      case 'open_settings':
        if (trigger_id) {
          await openModal(config.botToken, trigger_id, {
            type: 'modal',
            title: {
              type: 'plain_text',
              text: '⚙️ Genie Settings',
            },
            submit: {
              type: 'plain_text',
              text: 'Save',
            },
            close: {
              type: 'plain_text',
              text: 'Cancel',
            },
            callback_id: 'settings_modal',
            blocks: [
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: '*Customize your Genie experience*',
                },
              },
              {
                type: 'input',
                block_id: 'response_style',
                label: {
                  type: 'plain_text',
                  text: 'Response Style',
                },
                element: {
                  type: 'static_select',
                  action_id: 'response_style_select',
                  placeholder: {
                    type: 'plain_text',
                    text: 'Select a style',
                  },
                  options: [
                    {
                      text: { type: 'plain_text', text: 'Concise' },
                      value: 'concise',
                    },
                    {
                      text: { type: 'plain_text', text: 'Detailed' },
                      value: 'detailed',
                    },
                    {
                      text: { type: 'plain_text', text: 'Technical' },
                      value: 'technical',
                    },
                  ],
                },
              },
              {
                type: 'input',
                block_id: 'notifications',
                optional: true,
                label: {
                  type: 'plain_text',
                  text: 'Enable Notifications',
                },
                element: {
                  type: 'checkboxes',
                  action_id: 'notifications_checkboxes',
                  options: [
                    {
                      text: { type: 'plain_text', text: 'Daily summaries' },
                      value: 'daily_summary',
                    },
                    {
                      text: { type: 'plain_text', text: 'Memory updates' },
                      value: 'memory_updates',
                    },
                  ],
                },
              },
            ],
          });
        }
        break;

      default:
        console.log('[SLACK_INTERACTIVITY] Unknown action:', action_id);
    }
  }
}

/**
 * Handle view_submission (modal form submissions)
 */
async function handleViewSubmission(
  config: SlackConfig,
  payload: any
): Promise<{ response_action?: string; errors?: Record<string, string> }> {
  const { view, user } = payload;
  const { callback_id, state } = view;

  console.log('[SLACK_INTERACTIVITY] Processing view submission:', {
    teamId: config.teamId,
    callbackId: callback_id,
    userId: user?.id,
  });

  switch (callback_id) {
    case 'settings_modal':
      try {
        const values = state?.values || {};
        const responseStyle = values.response_style?.response_style_select?.selected_option?.value;
        const notifications = values.notifications?.notifications_checkboxes?.selected_options?.map(
          (opt: any) => opt.value
        ) || [];

        // Store user preferences
        await db
          .collection('slackUserPreferences')
          .doc(`${config.teamId}_${user.id}`)
          .set(
            {
              teamId: config.teamId,
              userId: user.id,
              responseStyle,
              notifications,
              updatedAt: Date.now(),
            },
            { merge: true }
          );

        console.log('[SLACK_INTERACTIVITY] Saved user preferences:', {
          teamId: config.teamId,
          userId: user.id,
          responseStyle,
          notifications,
        });

        // Return empty object to close the modal
        return {};
      } catch (error) {
        console.error('[SLACK_INTERACTIVITY] Failed to save preferences:', error);
        return {
          response_action: 'errors',
          errors: {
            response_style: 'Failed to save settings. Please try again.',
          },
        };
      }

    default:
      console.log('[SLACK_INTERACTIVITY] Unknown callback_id:', callback_id);
      return {};
  }
}

/**
 * Handle shortcuts (global and message shortcuts)
 */
async function handleShortcut(
  config: SlackConfig,
  payload: any
): Promise<void> {
  const { callback_id, trigger_id, user, message, channel } = payload;

  console.log('[SLACK_INTERACTIVITY] Processing shortcut:', {
    teamId: config.teamId,
    callbackId: callback_id,
    userId: user?.id,
  });

  switch (callback_id) {
    case 'ask_genie':
      // Open a modal to ask Genie
      await openModal(config.botToken, trigger_id, {
        type: 'modal',
        title: {
          type: 'plain_text',
          text: '🧞 Ask Genie',
        },
        submit: {
          type: 'plain_text',
          text: 'Ask',
        },
        close: {
          type: 'plain_text',
          text: 'Cancel',
        },
        callback_id: 'ask_genie_modal',
        private_metadata: JSON.stringify({ channelId: channel?.id }),
        blocks: [
          {
            type: 'input',
            block_id: 'question_block',
            label: {
              type: 'plain_text',
              text: 'Your Question',
            },
            element: {
              type: 'plain_text_input',
              action_id: 'question_input',
              multiline: true,
              placeholder: {
                type: 'plain_text',
                text: 'What would you like to know?',
              },
            },
          },
        ],
      });
      break;

    case 'summarize_message':
      // Summarize the selected message
      if (message?.text) {
        const summary = await generateGenieResponse(
          `Please summarize the following message concisely: ${message.text}`
        );

        await sendSlackMessage(
          config.botToken,
          channel.id,
          summary,
          [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `📝 *Summary:*\n${summary}`,
              },
            },
          ],
          message.ts
        );
      }
      break;

    default:
      console.log('[SLACK_INTERACTIVITY] Unknown shortcut:', callback_id);
  }
}

export async function POST(req: Request) {
  console.log('[SLACK_INTERACTIVITY] Received interaction request');

  try {
    const rawBody = await req.text();
    const timestamp = req.headers.get('x-slack-request-timestamp') || '';
    const signature = req.headers.get('x-slack-signature') || '';

    // Verify Slack signature in production
    if (process.env.NODE_ENV === 'production' && process.env.SLACK_SIGNING_SECRET) {
      if (!verifySlackSignature(rawBody, timestamp, signature)) {
        console.error('[SLACK_INTERACTIVITY] Invalid Slack signature');
        return new NextResponse('Unauthorized', { status: 401 });
      }
    }

    // Parse the payload (Slack sends as application/x-www-form-urlencoded)
    const params = new URLSearchParams(rawBody);
    const payloadString = params.get('payload');

    if (!payloadString) {
      console.error('[SLACK_INTERACTIVITY] No payload in request');
      return new NextResponse('Missing payload', { status: 400 });
    }

    const payload = JSON.parse(payloadString);
    const { type, team } = payload;

    console.log('[SLACK_INTERACTIVITY] Parsed payload:', {
      type,
      teamId: team?.id,
      userId: payload.user?.id,
    });

    // ───────────────────────────────────────────────────────��─────────
    // Extract Team ID (CRITICAL FOR MULTI-TENANCY)
    // ─────────────────────────────────────────────────────────────────
    const teamId = team?.id;
    if (!teamId) {
      console.error('[SLACK_INTERACTIVITY] No team_id in payload');
      return NextResponse.json({ ok: false, error: 'Missing team_id' });
    }

    // ─────────────────────────────────────────────────────────────────
    // Fetch Dynamic Credentials for this Workspace
    // ─────────────────────────────────────────────────────────────────
    let config: SlackConfig;
    try {
      config = await getSlackConfig(teamId);
    } catch (configError) {
      console.error(`[SLACK_INTERACTIVITY] No installation for team ${teamId}:`, configError);
      return NextResponse.json({
        ok: false,
        error: 'workspace_not_installed',
      });
    }

    // ──────────────────────────────��──────────────────────────────────
    // Handle Different Interaction Types
    // ─────────────────────────────────────────────────────────────────
    switch (type) {
      case 'block_actions':
        // Process asynchronously, respond immediately
        handleBlockActions(config, payload).catch((err) =>
          console.error('[SLACK_INTERACTIVITY] block_actions error:', err)
        );
        return NextResponse.json({ ok: true });

      case 'view_submission':
        // Must respond synchronously for modals
        const viewResponse = await handleViewSubmission(config, payload);
        return NextResponse.json(viewResponse);

      case 'shortcut':
      case 'message_action':
        // Process asynchronously, respond immediately
        handleShortcut(config, payload).catch((err) =>
          console.error('[SLACK_INTERACTIVITY] shortcut error:', err)
        );
        return NextResponse.json({ ok: true });

      default:
        console.log('[SLACK_INTERACTIVITY] Unknown interaction type:', type);
        return NextResponse.json({ ok: true });
    }
  } catch (error: any) {
    console.error('[SLACK_INTERACTIVITY_ERROR]', error);
    return NextResponse.json({ ok: false, error: 'Internal server error' });
  }
}

// Health check endpoint
export async function GET(req: Request) {
  return NextResponse.json({
    status: 'Slack Interactivity endpoint active',
    version: '2.0.0',
    timestamp: new Date().toISOString(),
  });
}
