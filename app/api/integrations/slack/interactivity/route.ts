import { sanitizeForLog } from '@/lib/security/urlValidator';
import { validateWebhookUrl } from '@/lib/security/urlValidator';
/**
 * Slack Interactivity Handler (Multi-Tenant) v3.1
 * 
 * Enhanced with corrected action handling.
 */

import { NextResponse } from 'next/server';
import { waitUntil } from '@vercel/functions';
import crypto from 'crypto';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { getSlackConfig, SlackConfig, resolveSlackUser, saveChannelConfig, type ChannelConfig } from '@/lib/slack';
import { db } from '@/lib/firebaseAdmin';
import { createFeedbackBlocks, createStreamer } from '@/lib/slack/assistantHelpers';
import { supabaseAdmin } from '@/lib/supabaseClient';
import { execFileSync } from 'child_process';
import path from 'path';

const SLACK_API_BASE = 'https://slack.com/api';

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');
const model = genAI.getGenerativeModel({
  model: "gemini-2.5-flash",
  safetySettings: [
    { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
    { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE },
  ],
});

const GENIE_SYSTEM_PROMPT = `You are 'Genie', a helpful AI assistant integrated with Slack. 
You provide concise, helpful responses suitable for chat. 
Keep responses brief but informative - Slack users prefer shorter messages.
Use Slack markdown formatting: *bold*, _italic_, \`code\`, \`\`\`code blocks\`\`\`.
When appropriate, use bullet points for clarity.
Be friendly and professional.`;

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
    const ssrfCheck = validateWebhookUrl(responseUrl);
    if (!ssrfCheck.valid) {
      console.error('[SLACK_INT] Blocked SSRF via response_url:', ssrfCheck.reason);
      return;
    }
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
 * Update an existing message
 */
async function updateSlackMessage(
  token: string,
  channel: string,
  ts: string,
  text: string,
  blocks?: any[]
): Promise<{ ok: boolean; error?: string }> {
  const payload: Record<string, any> = {
    channel,
    ts,
    text,
    mrkdwn: true,
  };

  if (blocks) {
    payload.blocks = blocks;
  }

  const response = await fetch(`${SLACK_API_BASE}/chat.update`, {
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
  feedbackType: 'positive' | 'negative',
  responseId: string,
  prompt?: string,
  responseText?: string
): Promise<void> {
  try {
    // 1) Store in Firestore (existing behavior)
    await db.collection('slackFeedback').add({
      teamId,
      userId,
      feedbackType,
      responseId,
      prompt,
      responseText,
      timestamp: Date.now(),
    });

    // 2) Store in Supabase feedback_events (for Continuous Learning)
    if (supabaseAdmin) {
      const rating = feedbackType === 'positive' ? 1 : -1;

      const { error } = await supabaseAdmin.from('feedback_events').insert({
        user_id: null, // Slack user is not necessarily a Clerk user; keep null and track in metadata
        source: 'slack',
        conversation_id: null,
        message_id: responseId,
        prompt_version: process.env.GIT_SHA || null,
        model: 'gemini-2.5-flash',
        input: prompt ?? null,
        output: responseText ?? null,
        rating,
        feedback_text: null,
        labels: ['slack_feedback'],
        metadata: {
          teamId,
          slackUserId: userId,
          feedbackType,
          responseId,
        },
        retrieval_context_ids: [],
      });

      if (error) {
        console.error('[SLACK_INTERACTIVITY] Failed to store Supabase feedback_events:', error);
      }
    }

    console.log('[SLACK_INTERACTIVITY] Stored feedback:', { teamId, feedbackType, responseId });
  } catch (error) {
    console.error('[SLACK_INTERACTIVITY] Failed to store feedback:', error);
  }
}

/**
 * Generate AI response using Gemini
 */
async function generateGenieResponse(prompt: string): Promise<string> {
  try {
    const chat = model.startChat({
      history: [
        {
          role: "user",
          parts: [{ text: GENIE_SYSTEM_PROMPT }],
        },
        {
          role: "model",
          parts: [{ text: "I understand. I'm Genie, ready to help in Slack with concise, helpful responses." }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.8,
        maxOutputTokens: 1024,
      },
    });

    const result = await chat.sendMessage(prompt);
    return result.response.text();
  } catch (error) {
    console.error('[SLACK_INTERACTIVITY] Error generating response:', error);
    return "I apologize, but I encountered an error processing your request. Please try again.";
  }
}

/**
 * Handle workflow_step_edit
 */
async function handleWorkflowStepEdit(
  config: SlackConfig,
  triggerId: string,
  callbackId: string,
  workflowStep: any
): Promise<void> {
  const stepInputs = workflowStep.inputs || {};

  // 1. Analyze Text Step
  if (callbackId === 'analyze_text_step') {
    await openModal(config.botToken, triggerId, {
      type: 'workflow_step',
      callback_id: 'analyze_text_save',
      blocks: [
        {
          type: 'input',
          block_id: 'input_text_block',
          label: { type: 'plain_text', text: 'Text to Analyze' },
          element: {
            type: 'plain_text_input',
            action_id: 'text_input',
            initial_value: stepInputs.text?.value || '',
            multiline: true
          }
        }
      ]
    });
  }

  // 2. Generate Code Step
  else if (callbackId === 'generate_code_step') {
    await openModal(config.botToken, triggerId, {
      type: 'workflow_step',
      callback_id: 'generate_code_save',
      blocks: [
        {
          type: 'input',
          block_id: 'prompt_block',
          label: { type: 'plain_text', text: 'Code Generation Prompt' },
          element: {
            type: 'plain_text_input',
            action_id: 'prompt_input',
            initial_value: stepInputs.prompt?.value || '',
            multiline: true
          }
        }
      ]
    });
  }
}

/**
 * Handle block_actions (button clicks, menu selections, feedback)
 */
async function handleBlockActions(
  config: SlackConfig,
  payload: any
): Promise<void> {
  const { actions, user, channel, message, response_url, trigger_id } = payload;

  for (const action of actions) {
    const { action_id, value, block_id, type: actionType } = action;

    console.log('[SLACK_INTERACTIVITY] Processing action:', {
      teamId: config.teamId,
      actionId: action_id,
      actionType,
      userId: user?.id,
    });

    if (action_id === 'bluesky_approve' || action_id === 'bluesky_reject') {
      const { handleBlueskyApproval } = await import('@/lib/bluesky/slack-approval');
      await handleBlueskyApproval(action_id === 'bluesky_approve', value, {
        channel: channel?.id,
        messageTs: message?.ts,
        userId: user?.id,
        responseUrl: response_url,
      });

      // Telemetry: bluesky draft action
      const { logEvent } = await import('@/lib/telemetry');
      logEvent({
        eventType: action_id === 'bluesky_approve' ? 'bluesky_draft_approved' : 'bluesky_draft_rejected',
        userId: user?.id,
        metadata: { queueItemId: value },
      });

      continue;
    }

    if (action_id === 'feedback_helpful' || action_id === 'feedback_not_helpful') {
      // Try to capture the AI response text from the Slack message so we can store it as `output`.
      const responseText = message?.text ??
        (Array.isArray(message?.blocks)
          ? message.blocks
            .filter((b: any) => b?.type === 'section' && b?.text?.type === 'mrkdwn')
            .map((b: any) => b.text.text)
            .join("\n\n")
          : undefined);

      await storeFeedback(
        config.teamId,
        user.id,
        action_id === 'feedback_helpful' ? 'positive' : 'negative',
        message?.ts || '',
        value,
        responseText
      );

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
                  text: action_id === 'feedback_helpful' ? '✅ _Thanks for your feedback!_' : '📝 _Thanks for your feedback! We\'ll work on improving._',
                },
              ],
            },
          ],
          replace_original: true,
        });
      }
      continue;
    }

    if (action_id === 'regenerate_response') {
      if (response_url && value) {
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

        const newResponse = await generateGenieResponse(value);
        const newResponseId = `regen-${Date.now()}`;

        await updateMessageViaResponseUrl(response_url, {
          text: newResponse,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🧞 *Genie*\n${newResponse}`,
              },
            },
            ...createFeedbackBlocks(newResponseId, value),
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
      continue;
    }

    if (action_id === 'save_to_memory') {
      try {
        // Try to resolve internal user ID
        const internalUserId = await resolveSlackUser(config.teamId, user.id);

        if (internalUserId) {
          // Store in main user memory
          await db
            .collection('users')
            .doc(internalUserId)
            .collection('memories')
            .add({
              userId: internalUserId,
              featureType: 'slack',
              title: `Slack Memory from <#${channel?.id}>`,
              summary: value,
              messages: [
                {
                  role: 'user',
                  content: value,
                  metadata: {
                    slackTs: message?.ts,
                    slackChannel: channel?.id,
                    slackUser: user.id
                  }
                }
              ],
              tags: ['slack', 'saved'],
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });

          if (response_url) {
            await updateMessageViaResponseUrl(response_url, {
              text: '🧠 Memory saved to your personal knowledge base!',
              response_type: 'ephemeral',
            });
          }
        } else {
          // Fallback: Store in slackMemories (legacy/unlinked)
          // TODO: Prompt user to link account
          await db.collection('slackMemories').add({
            teamId: config.teamId,
            userId: user.id,
            channelId: channel?.id,
            messageTs: message?.ts,
            content: value,
            timestamp: Date.now(),
          });

          if (response_url) {
            await updateMessageViaResponseUrl(response_url, {
              text: '💾 Memory saved! (Link your account to sync with web app)',
              response_type: 'ephemeral',
            });
          }
        }

      } catch (error) {
        console.error('[SLACK_INTERACTIVITY] Failed to save memory:', error);
        if (response_url) {
          await updateMessageViaResponseUrl(response_url, {
            text: '❌ Failed to save memory.',
            response_type: 'ephemeral',
          });
        }
      }
      continue;
    }

    if (action_id === 'open_settings') {
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
      continue;
    }

    if (action_id === 'onboarding_ask_question') {
      if (trigger_id) {
        // Reuse the same modal as 'ask_genie' shortcut
        await openModal(config.botToken, trigger_id, {
          type: 'modal',
          title: {
            type: 'plain_text',
            text: 'Ask Genie',
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
      }
      continue;
    }

    if (action_id === 'onboarding_see_stats') {
      if (response_url) {
        // We can't easily import getUserStats here as it's not exported, so we'll simulate a simple version or duplicates logic
        // For now, let's send a simple message
        await updateMessageViaResponseUrl(response_url, {
          text: '📊 *View your full stats in the App Home tab!*',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: "📊 *Your Stats*\n\nVisit the *App Home* tab to see your detailed usage statistics and recent memories.",
              },
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: 'How to find App Home' },
                  action_id: 'onboarding_app_home'
                }
              ]
            }
          ],
          response_type: 'ephemeral',
        });
      }
      continue;
    }

    if (action_id === 'onboarding_app_home') {
      if (response_url) {
        await updateMessageViaResponseUrl(response_url, {
          text: '🏠 *How to find App Home*',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: "*Using Genie's App Home*\n\nClick on the *'Genie'* app name in your Slack sidebar (under 'Apps'). Then click on the *'Home'* tab at the top of the screen.",
              },
            }
          ],
          response_type: 'ephemeral',
        });
      }
      continue;
    }

    if (action_id === 'engineer_approve') {
      if (response_url && value) {
        const { task, plan } = JSON.parse(value);

        await updateMessageViaResponseUrl(response_url, {
          text: '🚀 *Execution approved!* GenieBot is now working on the codebase...',
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `🚀 *Approved!* GenieBot is executing the plan for: "${task}"`
              }
            }
          ],
          replace_original: true,
        });

        // Run execution in the background
        waitUntil((async () => {
          try {
            // Dynamic path construction to bypass Turbopack static analysis
    const scriptSegments = ['.agent', 'skills', 'genie-context', 'scripts', 'engineer.mjs'];
    const scriptPath = path.join(/*turbopackIgnore: true*/ process.cwd(), ...scriptSegments);
            // Security fix (CodeQL #31, #23): use execFileSync with array args —
            // never interpolate user-controlled values into a shell command string.
            execFileSync('node', [scriptPath, task, '--execute-plan', JSON.stringify(plan)], {
              cwd: process.cwd(),
              env: { ...process.env, GOOGLE_API_KEY: process.env.GOOGLE_API_KEY }
            });

            await updateMessageViaResponseUrl(response_url, {
              text: `✅ *Task Completed!* GenieBot has finished: "${task}"`,
              blocks: [
                {
                  type: 'section',
                  text: {
                    type: 'mrkdwn',
                    text: `✅ *Engineering Task Completed!*\n\n*Task:* ${task}\n\nGenieBot has successfully modified the codebase and verified the changes.`
                  }
                }
              ],
              replace_original: true
            });
          } catch (error: any) {
            console.error('[SLACK_INTERACTIVITY] Engineering execution failed:', error.message);
            await updateMessageViaResponseUrl(response_url, {
              text: `❌ *Execution Failed:* ${error.message}`,
              replace_original: false // Don't replace the status message, just add an error
            });
          }
        })());
      }
      continue;
    }

    if (action_id === 'engineer_cancel') {
      if (response_url && value) {
        await updateMessageViaResponseUrl(response_url, {
          text: `❌ *Task Cancelled:* "${value}"`,
          blocks: [
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `❌ *Engineering Task Cancelled*\n\nTask: "${value}"\nNo changes were made to the codebase.`
              }
            }
          ],
          replace_original: true
        });
      }
      continue;
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
  const { callback_id, state, private_metadata } = view;

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

        console.log('[SLACK_INTERACTIVITY] Saved user preferences');
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

    case 'configure_channel_submission':
      try {
        const values = state?.values || {};
        const metadata = private_metadata ? JSON.parse(private_metadata) : {};
        const { channelId, teamId } = metadata;

        const persona = values.persona_block?.persona_selection?.selected_option?.value;
        const responseStyle = values.style_block?.style_selection?.selected_option?.value;
        const proactiveEnabled = values.proactive_block?.proactive_checkbox?.selected_options?.some((o: any) => o.value === 'enabled') || false;

        if (channelId && teamId) {
          await saveChannelConfig(teamId, channelId, {
            persona,
            responseStyle,
            proactiveEnabled
          } as ChannelConfig);

          console.log(`[SLACK_INTERACTIVITY] Saved config for channel ${channelId}`);
        }

        return {};
      } catch (error) {
        console.error('[SLACK_INTERACTIVITY] Failed to save channel config:', error);
        return {
          response_action: 'errors',
          errors: {
            persona_block: 'Failed to save settings.',
          },
        };
      }

    // Workflow Steps Saving
    case 'analyze_text_save':
    case 'generate_code_save':
      const values = state?.values || {};
      const inputs: any = {};
      const outputs: any = [];

      if (callback_id === 'analyze_text_save') {
        const text = values.input_text_block?.text_input?.value;
        inputs.text = { value: text };
        outputs.push({ name: 'analysis', type: 'text', label: 'Analysis Result' });
      } else {
        const prompt = values.prompt_block?.prompt_input?.value;
        inputs.prompt = { value: prompt };
        outputs.push({ name: 'code', type: 'text', label: 'Generated Code' });
      }

      try {
        const editId = view.workflow_step?.workflow_step_edit_id;
        if (editId) {
          await fetch(`${SLACK_API_BASE}/workflows.updateStep`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${config.botToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              workflow_step_edit_id: editId,
              inputs,
              outputs
            })
          });
        }
      } catch (e) {
        console.error('[WORKFLOW] Error updating step:', e);
      }
      return {};

    case 'ask_genie_modal':
      try {
        const values = state?.values || {};
        const question = values.question_block?.question_input?.value;
        const metadata = private_metadata ? JSON.parse(private_metadata) : {};
        const channelId = metadata.channelId;

        if (question && channelId) {
          // Generate response
          const response = await generateGenieResponse(question);
          const responseId = `modal-${Date.now()}`;

          // Send response to channel
          await sendSlackMessage(
            config.botToken,
            channelId,
            response,
            [
              {
                type: 'context',
                elements: [
                  {
                    type: 'mrkdwn',
                    text: `\uD83E\uDDDE * Genie * • Asked by < @${user.id} > `,
                  },
                ],
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: `*Q:* ${question}`,
                },
              },
              {
                type: 'section',
                text: {
                  type: 'mrkdwn',
                  text: response,
                },
              },
              ...createFeedbackBlocks(responseId, question),
            ]
          );
        }

        return {};
      } catch (error) {
        console.error('[SLACK_INTERACTIVITY] Failed to process question:', error);
        return {
          response_action: 'errors',
          errors: {
            question_block: 'Failed to process your question. Please try again.',
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
      await openModal(config.botToken, trigger_id, {
        type: 'modal',
        title: {
          type: 'plain_text',
          text: '⚙️ Genie Settings',
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
      if (message?.text) {
        const summary = await generateGenieResponse(
          `Please summarize the following message concisely: ${message.text} `
        );
        const responseId = `summary - ${Date.now()} `;

        await sendSlackMessage(
          config.botToken,
          channel.id,
          summary,
          [
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `\uD83D\uDCDD * Summary * • Requested by < @${user.id}> `,
                },
              ],
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: summary,
              },
            },
            ...createFeedbackBlocks(responseId, message.text),
          ],
          message.ts
        );
      }
      break;

    case 'explain_message':
      if (message?.text) {
        const explanation = await generateGenieResponse(
          `Please explain the following message in simple terms: ${message.text} `
        );
        const responseId = `explain - ${Date.now()} `;

        await sendSlackMessage(
          config.botToken,
          channel.id,
          explanation,
          [
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `\uD83D\uDCA1 * Explanation * • Requested by < @${user.id}> `,
                },
              ],
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: explanation,
              },
            },
            ...createFeedbackBlocks(responseId, message.text),
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

    // Parse the payload
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

    // Extract Team ID
    const teamId = team?.id;
    if (!teamId) {
      console.error('[SLACK_INTERACTIVITY] No team_id in payload');
      return NextResponse.json({ ok: false, error: 'Missing team_id' });
    }

    // Fetch workspace config
    let config: SlackConfig;
    try {
      config = await getSlackConfig(teamId);
    } catch (configError) {
      console.error(`[SLACK_INTERACTIVITY] No installation for team ${sanitizeForLog(teamId)}: `, configError); // lgtm[js/tainted-format-string]
      return NextResponse.json({
        ok: false,
        error: 'workspace_not_installed',
      });
    }

    // Handle different interaction types
    switch (type) {
      case 'workflow_step_edit':
        await handleWorkflowStepEdit(config, payload.trigger_id, payload.callback_id, payload.workflow_step);
        return new NextResponse('', { status: 200 });

      case 'block_actions':
        waitUntil(handleBlockActions(config, payload).catch((err) =>
          console.error('[SLACK_INTERACTIVITY] block_actions error:', err)
        ));
        return NextResponse.json({ ok: true });

      case 'view_submission':
        // view_submission must return a payload immediately if updating view, so we await this one
        const viewResponse = await handleViewSubmission(config, payload);
        return NextResponse.json(viewResponse);

      case 'shortcut':
      case 'message_action':
        waitUntil(handleShortcut(config, payload).catch((err) =>
          console.error('[SLACK_INTERACTIVITY] shortcut error:', err)
        ));
        return NextResponse.json({ ok: true });

      case 'block_suggestion':
        console.log('[SLACK_INTERACTIVITY] Received block_suggestion (options load request)');
        // Return empty options by default as we don't have external selects yet
        // If we add them, we'll route based on action_id here
        return NextResponse.json({ options: [] });

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
    version: '3.0.0',
    features: [
      'multi-tenant',
      'feedback-buttons',
      'regenerate',
      'settings-modal',
      'shortcuts',
      'workflow-steps'
    ],
    timestamp: new Date().toISOString(),
  });
}
