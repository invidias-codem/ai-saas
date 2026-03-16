import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { VertexAI } from "@google-cloud/vertexai";
import * as snowflake from "snowflake-sdk";
import { PubSub } from "@google-cloud/pubsub";

// Initialize Firebase Admin (if not already initialized in index.ts)
// admin.initializeApp();
const db = admin.firestore();

// Initialize Vertex AI
const project = process.env.GCP_PROJECT || "genie-ai-saas";
const location = process.env.GCP_LOCATION || "us-central1";
const vertexAI = new VertexAI({ project: project, location: location });

// Snowflake Configuration
const snowflakeConnection = snowflake.createConnection({
  account: process.env.SNOWFLAKE_ACCOUNT || "",
  username: process.env.SNOWFLAKE_USERNAME || "",
  password: process.env.SNOWFLAKE_PASSWORD || "", // Ideally use Key Pair auth in prod
  warehouse: process.env.SNOWFLAKE_WAREHOUSE || "COMPUTE_WH",
  database: process.env.SNOWFLAKE_DATABASE || "GENIE_R1",
  schema: process.env.SNOWFLAKE_SCHEMA || "PUBLIC",
  role: process.env.SNOWFLAKE_ROLE || "ACCOUNTADMIN",
});

// Types
interface VerificationResult {
    approval: boolean;
    score: number;
    feedback: string;
    maturity_markers: any;
    punishment_multiplier: number;
    jail_status: "FREE" | "WARNING" | "IN_SOLITARY";
}

/**
 * 1. INFERENCE FUNCTION
 * Orchestrates the Reasoning Loop:
 * - Checks Jail Status
 * - Calls Gemini 2.0 Flash (Thinking Mode)
 * - Publishes result to Pub/Sub for Verification
 */
export const orchestrateGenieLoop = functions.https.onCall(async (data, context) => {
  const { prompt, conversationId, domain = "General", userId } = data;

  if (!userId) {
    throw new functions.https.HttpsError("unauthenticated", "User ID required.");
  }

  // 1. Jail Check (Cool-down enforcement)
  // In a real implementation, this would check a fast cache (Redis/Firestore)
  const userStatusRef = db.collection("user_r1_status").doc(userId);
  const userStatusDoc = await userStatusRef.get();

  if (userStatusDoc.exists) {
    const status = userStatusDoc.data();
    if (status?.jail_status === "IN_SOLITARY") {
      const cooldownEnd = status.cooldown_expires_at?.toMillis() || 0;
      if (Date.now() < cooldownEnd) {
        throw new functions.https.HttpsError("resource-exhausted", "Genie is currently in solitary confinement. Please try again later.");
      }
    }
  }

  try {
    // 2. Call Gemini 2.0 Flash Thinking Mode
    // Note: 'gemini-2.0-flash-thinking-exp' is the experimental model name
    const model = vertexAI.getGenerativeModel({
      model: "gemini-2.0-flash-thinking-exp-1219"
    });

    const chat = model.startChat({});
    // Depending on SDK support, we might need to parse 'thoughts' manually 
    // if they are returned as part of the text.
    // For now, we assume the model output contains thoughts in a specific format 
    // OR the SDK provides a way to access separate 'candidates[0].content.parts' that are thoughts.

    const result = await chat.sendMessage(prompt);
    const response = await result.response;
    const text = response.candidates?.[0].content.parts[0].text || "";

    // Mock Parsing for 'Thinking' vs 'Answer' 
    // (If the model natively separates them, we'd access that property)
    // Adjust regex based on actual model behavior
    const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/);
    const trajectory = thinkMatch ? thinkMatch[1].trim() : "No explicit reasoning found.";
    const answer = text.replace(/<think>[\s\S]*?<\/think>/, "").trim();

    // 3. Publish to Pub/Sub for Verification (Async)
    // This decouples the user response from the heavy verification logic
    const pubSubClient = new PubSub();
    const topicName = "verify-reasoning-trajectory";

    const messageBuffer = Buffer.from(JSON.stringify({
      userId,
      conversationId,
      domain,
      trajectory,
      answer,
      modelId: "gemini-2.0-flash-thinking-exp-1219",
      sessionId: context.auth?.uid || "anonymous" // Or use specific session ID 
    }));

    try {
      await pubSubClient.topic(topicName).publishMessage({ data: messageBuffer });
    } catch (e) {
      console.error("PubSub publish failed:", e);
      // Non-blocking error for the user, but critical for the loop
    }

    return { success: true, answer, trajectory };

  } catch (error) {
    console.error("Orchestration Error:", error);
    throw new functions.https.HttpsError("internal", "Reasoning Loop Failed");
  }
});

/**
 * 2. VERIFICATION FUNCTION (Pub/Sub Trigger)
 * - Receives Trajectory
 * - Calls Snowflake Stored Procedure
 * - Triggers Feedback Function
 */
export const verifyReasoning = functions.pubsub.topic("verify-reasoning-trajectory").onPublish(async (message) => {
  const data = message.json;
  const { userId, trajectory, answer, domain, sessionId } = data;

  // Connect to Snowflake
  await new Promise<void>((resolve, reject) => {
    snowflakeConnection.connect((err, conn) => {
      if (err) {
        console.error("Unable to connect to Snowflake: " + err.message);
        reject(err);
      } else {
        resolve();
      }
    });
  });

  try {
    // Call Stored Procedure: VERIFY_REASONING(trajectory, answer, domain, sessionId)
    const sqlText = "CALL VERIFY_REASONING(?, ?, ?, ?)";
    const binds = [trajectory, answer, domain, sessionId];

    const result: VerificationResult = await new Promise((resolve, reject) => {
      snowflakeConnection.execute({
        sqlText: sqlText,
        binds: binds,
        complete: (err, stmt, rows) => {
          if (err) {
            reject(err);
          } else {
            // Assuming the SP returns a JSON object in the first column
            resolve(rows?.[0]?.["VERIFY_REASONING"] || {});
          }
        }
      });
    });

    // Pass result to Feedback Loop
    await applyPunishmentOrReward(userId, result, trajectory);

  } catch (err) {
    console.error("Verification Failed:", err);
  }
});

/**
 * 3. FEEDBACK FUNCTION (Internal Helper)
 * - Updates User Status (Jail)
 * - Distills "Gold Standard" trajectories
 */
async function applyPunishmentOrReward(userId: string, result: VerificationResult, trajectory: string) {
  const userRef = db.collection("user_r1_status").doc(userId);

  // 1. Handle Punishment/Reward
  if (result.jail_status === "IN_SOLITARY") {
    // Apply 1 hour cooldown
    await userRef.set({
      jail_status: "IN_SOLITARY",
      cooldown_expires_at: admin.firestore.Timestamp.fromMillis(Date.now() + 3600000),
      last_violation: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  } else {
    // Reset or maintain status
    await userRef.set({
      jail_status: result.jail_status || "FREE",
      // Ideally we clear cooldown only if it was previously set and expired, or explicit forgiveness
    }, { merge: true });
  }

  // 2. Distillation: Save "Gold Standard" 
  if (result.score > 0.9) { // High quality threshold
    // We write back to Snowflake "Gold Standard" table for future fine-tuning
    // This could also be a separate async process if latency matters here
    const insertSql = "INSERT INTO GOLD_STANDARD_TRAJECTORIES (TRAJECTORY, SCORE, DOMAIN, CREATED_AT) VALUES (?, ?, ?, CURRENT_TIMESTAMP())";

    snowflakeConnection.execute({
      sqlText: insertSql,
      binds: [trajectory, result.score, "General"] // pass domain if available in this scope
    });
  }
}
