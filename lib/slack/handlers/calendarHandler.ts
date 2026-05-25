import { sanitizeForLog } from '@/lib/security/urlValidator';
/**
 * Google Calendar Handler for Slack
 * Creates calendar events using Google Calendar API
 */

import { google } from 'googleapis';
import { GoogleGenerativeAI } from "@google/generative-ai";
import { SlackConfig } from '@/lib/slack';

const SLACK_API_BASE = 'https://slack.com/api';
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');

interface MeetingDetails {
    title: string;
    datetime: string;
    duration?: number; // in minutes
    attendees?: string[];
    description?: string;
}

interface GoogleCredentials {
    client_email: string;
    private_key: string;
}

/**
 * Helper to retrieve Google Cloud Credentials
 * Supports both individual env vars and JSON key
 */
function getGoogleCredentials(): GoogleCredentials {
    // 1. Try individual variables first
    if (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
        return {
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
        };
    }

    // 2. Try JSON key
    const jsonKey = process.env.GCP_SERVICE_ACCOUNT_KEY_JSON;
    if (jsonKey) {
        try {
            // Clean string to remove potential bad control characters (newlines)
            let cleanedJson = jsonKey.replace(/[\n\r]+/g, '').trim();

            // Remove wrapping quotes if present
            if ((cleanedJson.startsWith("'") && cleanedJson.endsWith("'")) ||
                (cleanedJson.startsWith('"') && cleanedJson.endsWith('"'))) {
                cleanedJson = cleanedJson.slice(1, -1);
            }

            const parsed = JSON.parse(cleanedJson);
            if (parsed.client_email && parsed.private_key) {
                return {
                    client_email: parsed.client_email,
                    private_key: parsed.private_key.replace(/\\n/g, '\n'),
                };
            }
        } catch (error) {
            console.error('[CALENDAR_HANDLER] Failed to parse GCP_SERVICE_ACCOUNT_KEY_JSON:', error);
        }
    }

    throw new Error('Google Calendar credentials not found. Please set GCP_SERVICE_ACCOUNT_KEY_JSON.');
}

/**
 * Extracts Slack user IDs from a given text string.
 * Slack user mentions can be in the format <@U123ABC> or <@U123ABC|john.doe>.
 */
function extractSlackUserIds(text: string): string[] {
    const userMentionRegex = /<@([UW][A-Z0-9]+)(?:\|[^>]+)?>/g;
    const matches = [...text.matchAll(userMentionRegex)];
    return matches.map(match => match[1]);
}

/**
 * Resolves a Slack user ID to their email address using the Slack API.
 */
async function getSlackUserEmail(botToken: string, userId: string): Promise<string | null> {
    try {
        const response = await fetch(`${SLACK_API_BASE}/users.info?user=${sanitizeForLog(userId)}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${botToken}`,
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json();

        if (data.ok && data.user && data.user.profile && data.user.profile.email) {
            return data.user.profile.email;
        } else {
            console.warn(`[CALENDAR_HANDLER] Failed to get email for Slack user ${sanitizeForLog(userId)}:`, data.error || 'User not found or no email'); // lgtm[js/tainted-format-string]
            return null;
        }
    } catch (error) {
        console.error(`[CALENDAR_HANDLER] Error fetching Slack user info for ${sanitizeForLog(userId)}:`, error);
        return null;
    }
}

/**
 * Extract meeting details using Gemini
 */
async function extractMeetingDetails(userMessage: string): Promise<MeetingDetails> {
    console.log('[CALENDAR_HANDLER] Extracting meeting details from:', userMessage);

    const model = genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-flash" });

    const prompt = `Extract meeting details from this message: "${userMessage}"

Return ONLY valid JSON in this exact format:
{
  "title": "Meeting Title",
  "datetime": "ISO 8601 datetime string (e.g., 2024-01-15T14:00:00)",
  "duration": 60,
  "attendees": ["email1@example.com", "email2@example.com", "SLACK_USER_ID"],
  "description": "Optional meeting description"
}

IMPORTANT: For Slack user mentions (like <@U123ABC> or <@U123ABC|john>), include the FULL mention string in attendees.
For email addresses, include them as-is.
If the datetime is relative (e.g., "tomorrow at 2pm"), convert it to an absolute ISO 8601 datetime.
Current datetime: ${new Date().toISOString()}
Default duration is 60 minutes if not specified.`;

    try {
        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim();

        // Extract JSON from response
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in AI response');
        }

        const details = JSON.parse(jsonMatch[0]) as MeetingDetails;
        console.log('[CALENDAR_HANDLER] Extracted details:', details);

        return details;

    } catch (error) {
        console.error('[CALENDAR_HANDLER] Error extracting details:', error);
        throw error;
    }
}

/**
 * Create Google Calendar event
 * Note: This requires a service account or user OAuth token
 */
async function createCalendarEvent(details: MeetingDetails): Promise<string> {
    console.log('[CALENDAR_HANDLER] Creating calendar event');

    try {
        // Initialize Google Calendar API
        const credentials = getGoogleCredentials();

        const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/calendar'],
        });

        const calendar = google.calendar({ version: 'v3', auth });

        // Calculate end time
        const startTime = new Date(details.datetime);
        const endTime = new Date(startTime.getTime() + (details.duration || 60) * 60000);

        // Create event
        const event = {
            summary: details.title,
            description: details.description || `Created by Genie AI via Slack`,
            start: {
                dateTime: startTime.toISOString(),
                timeZone: 'America/New_York', // TODO: Make this configurable
            },
            end: {
                dateTime: endTime.toISOString(),
                timeZone: 'America/New_York',
            },
            attendees: details.attendees?.map(email => ({ email })) || [],
            reminders: {
                useDefault: true,
            },
        };

        const response = await calendar.events.insert({
            calendarId: 'primary',
            requestBody: event,
            sendUpdates: 'all', // Send email invites to attendees
        });

        console.log('[CALENDAR_HANDLER] Event created:', response.data.id);
        return response.data.htmlLink || response.data.id || 'Event created';

    } catch (error) {
        console.error('[CALENDAR_HANDLER] Error creating calendar event:', error);
        throw error;
    }
}

/**
 * Set loading status
 */
async function setLoadingStatus(
    botToken: string,
    channel: string,
    threadTs: string,
    message: string
): Promise<void> {
    try {
        await fetch(`${SLACK_API_BASE}/assistant.threads.setStatus`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${botToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                channel_id: channel,
                thread_ts: threadTs,
                status: message,
            }),
        });
    } catch (error) {
        console.error('[CALENDAR_HANDLER] Error setting status:', error);
    }
}

/**
 * Send message to Slack
 */
async function sendSlackMessage(
    botToken: string,
    channel: string,
    text: string,
    threadTs?: string
): Promise<void> {
    await fetch(`${SLACK_API_BASE}/chat.postMessage`, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${botToken}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            channel,
            thread_ts: threadTs,
            text,
        }),
    });
}

/**
 * Main handler for calendar event creation
 */
export async function handleCalendarEvent(
    config: SlackConfig,
    event: any,
    userMessage: string
): Promise<void> {
    const { channel, ts, thread_ts, user } = event;
    const threadTs = thread_ts || ts;

    console.log('[CALENDAR_HANDLER] Handling calendar event request');

    try {
        // Validate credentials before doing work
        try {
            getGoogleCredentials();
        } catch (e) {
            throw new Error('Google Calendar is not configured. Please contact your administrator.');
        }

        // Set loading status
        await setLoadingStatus(
            config.botToken,
            channel,
            threadTs,
            '📅 Scheduling your meeting...'
        );

        // Extract meeting details
        const details = await extractMeetingDetails(userMessage);

        // Resolve Slack user mentions to email addresses
        const resolvedAttendees: Set<string> = new Set(); // Use Set to avoid duplicates

        // 1. Resolve attendees mentioned in the message
        if (details.attendees && details.attendees.length > 0) {
            for (const attendee of details.attendees) {
                // Check if this is a Slack user mention
                const slackUserIds = extractSlackUserIds(attendee);

                if (slackUserIds.length > 0) {
                    // Resolve each Slack user ID to email
                    for (const userId of slackUserIds) {
                        const email = await getSlackUserEmail(config.botToken, userId);
                        if (email) {
                            resolvedAttendees.add(email);
                        } else {
                            console.warn(`[CALENDAR_HANDLER] Could not resolve Slack user ${sanitizeForLog(userId)}, skipping`);
                        }
                    }
                } else if (attendee.includes('@') && !attendee.includes('<')) {
                    // Already an email address
                    resolvedAttendees.add(attendee);
                }
            }
        }

        // 2. Automatically invite the sender
        if (user) {
            console.log(`[CALENDAR_HANDLER] Auto-inviting sender: ${sanitizeForLog(user)}`);
            const senderEmail = await getSlackUserEmail(config.botToken, user);
            if (senderEmail) {
                resolvedAttendees.add(senderEmail);
            } else {
                console.warn(`[CALENDAR_HANDLER] Could not resolve email for sender ${sanitizeForLog(user)}`);
            }
        }

        // Update details with resolved unique attendees
        details.attendees = Array.from(resolvedAttendees);
        console.log('[CALENDAR_HANDLER] Final attendee list:', details.attendees);

        // Create calendar event
        const eventLink = await createCalendarEvent(details);

        // Format attendees list
        const attendeesList = details.attendees && details.attendees.length > 0
            ? `\n👥 *Attendees:* ${details.attendees.join(', ')}`
            : '';

        // Send confirmation message
        const confirmationMessage = `✅ *Meeting Scheduled!*

📅 *${details.title}*
🕐 ${new Date(details.datetime).toLocaleString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            timeZoneName: 'short'
        })}
⏱️ Duration: ${details.duration || 60} minutes${attendeesList}

🔗 <${eventLink}|View in Google Calendar>`;

        await sendSlackMessage(
            config.botToken,
            channel,
            confirmationMessage,
            threadTs
        );

        // Clear loading status
        await setLoadingStatus(config.botToken, channel, threadTs, '');

        console.log('[CALENDAR_HANDLER] Calendar event creation complete');

    } catch (error) {
        console.error('[CALENDAR_HANDLER] Error in handleCalendarEvent:', error);

        // Send error message
        await sendSlackMessage(
            config.botToken,
            channel,
            `❌ Sorry, I encountered an error scheduling the meeting: ${error instanceof Error ? error.message : 'Unknown error'}

💡 *Tip:* Make sure to include:
• Meeting title or purpose
• Date and time (e.g., "tomorrow at 2pm")
• Attendee email addresses (optional)`,
            threadTs
        );

        // Clear loading status
        await setLoadingStatus(config.botToken, channel, threadTs, '');
    }
}
