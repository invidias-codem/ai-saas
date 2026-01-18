/**
 * Slack App Home Manager
 *
 * Renders and manages the Genie AI App Home tab in Slack.
 */
import { getSlackConfig } from './tokenManager';
import { db } from '@/lib/firebaseAdmin';

const SLACK_API_BASE = 'https://slack.com/api';

/**
 * Publishes the App Home view for a user.
 *
 * @param userId The Slack user ID.
 * @param teamId The Slack team ID.
 */
export async function publishAppHome(userId: string, teamId: string): Promise<void> {
  if (!teamId) {
    console.warn(`[APP_HOME] Cannot publish App Home: Team ID is missing for user ${userId}`);
    return;
  }

  try {
    const config = await getSlackConfig(teamId);
    const view = await buildAppHomeView(userId, teamId);

    await fetch(`${SLACK_API_BASE}/views.publish`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.botToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        user_id: userId,
        view: view,
      }),
    });
  } catch (error) {
    console.error(`[APP_HOME] Error publishing App Home for user ${userId} in team ${teamId}:`, error);
  }
}

/**
 * Builds the Block Kit view for the App Home tab.
 *
 * @param userId The Slack user ID.
 * @param teamId The Slack team ID.
 * @returns The Block Kit view payload.
 */
async function buildAppHomeView(userId: string, teamId: string): Promise<any> {
  // These would ideally fetch real data from Firestore
  const recentMemories = await getRecentMemories(userId, teamId);
  const userStats = await getUserStats(userId, teamId);

  return {
    type: 'home',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Welcome to Genie AI, <@${userId}>!* 🧞`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: "Your intelligent assistant for Slack. Ask me questions, get help with code, and I'll remember our conversations.",
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Ask Genie a Question',
              emoji: true,
            },
            style: 'primary',
            action_id: 'ask_genie_modal',
          },
        ],
      },
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '*Your Recent Memories*',
          },
        ],
      },
      ...recentMemories,
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: '*Your Stats*',
          },
        ],
      },
      userStats,
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: "*What Genie Can Do* 🚀",
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: "• *Code Analysis:* Debug, review, explain, and generate code in 15+ languages\n• *File Analysis:* Read and analyze PDFs, code files, and text documents\n• *Link Extraction:* Summarize content from shared URLs\n• *Thread Memory:* Remember context within conversation threads\n• *Multi-Language:* Support for Python, JavaScript, TypeScript, Go, Java, and more",
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: "*Current Limitations* ⚠️",
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: "• *No Code Execution:* I analyze code but cannot run it\n• *Session Memory:* I may not remember details across different threads\n• *No Proactive Monitoring:* I respond when asked, not automatically\n• *Limited Slack Actions:* I can't manage channels or users directly\n• *External Services:* I need explicit integrations to access APIs",
        },
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: "_We're actively working to improve! Check our roadmap for upcoming features._",
          },
        ],
      },
      { type: 'divider' },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: "*What's New in Genie* ✨\n• *Thread Memory:* I now remember context within our threads!\n• *App Home:* Check back here for your stats and recent memories.\n• *Better Code Support:* I'm now smarter at debugging and writing code.",
        },
      },
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: "💡 *Tip:* You can mention me (@Genie) in any channel I'm in, or send me a direct message.",
          },
        ],
      },
    ],
  };
}

// Mocked data fetching functions for now
async function getRecentMemories(userId: string, teamId: string): Promise<any[]> {
  try {
    const memoriesSnapshot = await db
      .collection('users')
      .doc(userId)
      .collection('memories')
      .orderBy('createdAt', 'desc')
      .limit(5)
      .get();

    if (memoriesSnapshot.empty) {
      return [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: "You don't have any memories yet. Start a conversation with me and I'll start remembering!",
          },
        },
      ];
    }

    return memoriesSnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `• *${data.title || 'Untitled Memory'}*\n  ${data.summary || 'No summary available.'}`,
        },
      };
    });
  } catch (error) {
    console.error(`[APP_HOME] Error fetching memories for ${userId}:`, error);
    return [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: "⚠️ Couldn't load recent memories right now.",
        },
      },
    ];
  }
}

async function getUserStats(userId: string, teamId: string): Promise<any> {
  try {
    const profileDoc = await db
      .collection('users')
      .doc(userId)
      .collection('context')
      .doc('profile')
      .get();

    const stats = profileDoc.exists ? profileDoc.data() : {};

    // Fallback or default values
    const totalInteractions = stats?.totalInteractions || 0;
    // We might track tokens in metadata or a separate stats doc, but assuming profile has aggregated stats for now
    const totalTokens = stats?.totalTokensUsed || 0;

    return {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Total Interactions:* ${totalInteractions}`,
        },
        {
          type: 'mrkdwn',
          text: `*Tokens Used:* ${totalTokens}`,
        },
      ],
    };
  } catch (error) {
    console.error(`[APP_HOME] Error fetching stats for ${userId}:`, error);
    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: "⚠️ Couldn't load stats.",
      },
    };
  }
}
