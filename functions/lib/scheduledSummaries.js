"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendDailySummaries = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const axios_1 = __importDefault(require("axios"));
const vertexai_1 = require("@google-cloud/vertexai");
const SLACK_API_BASE = "https://slack.com/api";
// Initialize Vertex AI
const vertexAI = new vertexai_1.VertexAI({ project: process.env.GCLOUD_PROJECT || "ai-nexus-saas", location: "us-central1" });
const model = vertexAI.getGenerativeModel({ model: "gemini-1.5-flash-001" });
/**
 * Scheduled Function: Send Daily Summaries
 * Runs every day at 9:00 AM
 */
exports.sendDailySummaries = functions.pubsub.schedule("every 24 hours").onRun(async (context) => {
    const db = admin.firestore();
    console.log("[DAILY_SUMMARY] Starting daily summary generation...");
    try {
        // 1. Find users with enabled Slack notifications
        // Use collection group query on 'profile' documents
        const profilesSnapshot = await db.collectionGroup("profile")
            .where("integrations.slackEnabled", "==", true)
            .where("integrations.slackTeamId", ">=", "") // Ensure teamId exists
            .get();
        console.log(`[DAILY_SUMMARY] Found ${profilesSnapshot.size} profiles with Slack enabled`);
        const processedChannels = new Set();
        for (const doc of profilesSnapshot.docs) {
            const data = doc.data();
            const integration = data.integrations;
            const { slackChannelId, slackTeamId } = integration;
            // Avoid duplicate summaries for same channel (if multiple users configured same channel)
            const channelKey = `${slackTeamId}:${slackChannelId}`;
            if (processedChannels.has(channelKey)) {
                continue;
            }
            processedChannels.add(channelKey);
            try {
                await generateAndSendSummary(slackTeamId, slackChannelId);
            }
            catch (err) {
                console.error(`[DAILY_SUMMARY] Failed for channel ${slackChannelId}:`, err);
            }
        }
    }
    catch (error) {
        console.error("[DAILY_SUMMARY] Fatal error:", error);
    }
});
async function generateAndSendSummary(teamId, channelId) {
    const db = admin.firestore();
    // 2. Get Bot Token
    const installationDoc = await db.collection("slack_installations").doc(teamId).get();
    if (!installationDoc.exists) {
        console.warn(`[DAILY_SUMMARY] No installation found for team ${teamId}`);
        return;
    }
    const installation = installationDoc.data();
    const token = installation?.bot?.token;
    if (!token) {
        console.warn(`[DAILY_SUMMARY] No bot token for team ${teamId}`);
        return;
    }
    // 3. Fetch recent history (Last 24h)
    const yesterday = (Date.now() / 1000) - (24 * 60 * 60);
    const historyResponse = await axios_1.default.post(`${SLACK_API_BASE}/conversations.history`, {
        channel: channelId,
        oldest: yesterday,
        limit: 100
    }, {
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        }
    });
    if (!historyResponse.data.ok) {
        throw new Error(`Slack API error: ${historyResponse.data.error}`);
    }
    const messages = historyResponse.data.messages || [];
    if (messages.length === 0) {
        console.log(`[DAILY_SUMMARY] No messages in channel ${channelId} to summarize.`);
        return;
    }
    // Filter out bot messages to focus on human activity
    const humanMessages = messages.filter((m) => !m.bot_id && m.type === "message").reverse();
    if (humanMessages.length === 0) {
        return;
    }
    const conversationText = humanMessages.map((m) => {
        const user = m.user || "Unknown";
        return `${user}: ${m.text}`;
    }).join("\n");
    // 4. Generate Summary
    const prompt = `
Summarize the following Slack conversation from the last 24 hours. 
Highlight key decisions, open questions, and important updates.
Keep it concise and use bullet points.

Conversation:
${conversationText}
`;
    const result = await model.generateContent(prompt);
    const response = result.response;
    const summary = response.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!summary) {
        return;
    }
    // 5. Post Summary
    await axios_1.default.post(`${SLACK_API_BASE}/chat.postMessage`, {
        channel: channelId,
        text: "🌅 *Daily Channel Summary*",
        blocks: [
            {
                type: "header",
                text: {
                    type: "plain_text",
                    text: "🌅 Daily Channel Summary",
                    emoji: true
                }
            },
            {
                type: "section",
                text: {
                    type: "mrkdwn",
                    text: summary
                }
            },
            {
                type: "context",
                elements: [
                    {
                        type: "mrkdwn",
                        text: "Generated by Genie AI • " + new Date().toLocaleDateString()
                    }
                ]
            }
        ]
    }, {
        headers: {
            "Authorization": `Bearer ${token}`,
            "Content-Type": "application/json"
        }
    });
    console.log(`[DAILY_SUMMARY] Sent summary to channel ${channelId}`);
}
//# sourceMappingURL=scheduledSummaries.js.map