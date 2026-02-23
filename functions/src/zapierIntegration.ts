/**
 * Zapier Integration - Webhook handlers for triggering external workflows
 */

import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import axios from "axios";
import { ZapierWebhook } from "./schemas";

/**
 * HTTP Cloud Function - Zapier Authentication/Configuration
 */
export const handleZapierAuth = functions.https.onRequest(async (req, res) => {
  try {
    const { userId, webhookUrl, triggerEvents } = req.body;

    if (!userId || !webhookUrl || !triggerEvents) {
      res.status(400).json({
        error: "Missing required fields: userId, webhookUrl, triggerEvents",
      });
      return;
    }

    const db = admin.firestore();

    // Store Zapier webhook configuration
    const zapierWebhook: ZapierWebhook = {
      id: `zapier-${Date.now()}`,
      userId,
      webhookUrl,
      triggerEvents,
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    await db
      .collection("users")
      .doc(userId)
      .collection("integrations")
      .doc("zapier")
      .set(zapierWebhook);

    // Also update user context
    await db
      .collection("users")
      .doc(userId)
      .collection("context")
      .doc("profile")
      .update({
        "integrations.zapierEnabled": true,
        "integrations.zapierToken": webhookUrl,
      });

    // Send test webhook
    try {
      await axios.post(webhookUrl, {
        event: "zapier.connected",
        userId,
        timestamp: Date.now(),
        message: "Zapier integration successfully connected to Genie AI",
      });
    } catch (error) {
      console.warn("Test webhook send failed:", error);
    }

    res.status(200).json({
      success: true,
      message: "Zapier integration configured successfully",
      webhookId: zapierWebhook.id,
    });
  } catch (error) {
    console.error("Error configuring Zapier integration:", error);
    res.status(500).json({ error: `Failed to configure Zapier: ${error}` });
  }
});

/**
 * Trigger Zapier webhooks on events
 */
export async function triggerZapierWebhook(
  userId: string,
  eventType: string,
  eventData: Record<string, any>
): Promise<void> {
  try {
    const db = admin.firestore();

    // Fetch Zapier webhook config
    const zapierDoc = await db
      .collection("users")
      .doc(userId)
      .collection("integrations")
      .doc("zapier")
      .get();

    if (!zapierDoc.exists) {
      console.log(`No Zapier integration found for user ${userId}`);
      return;
    }

    const zapier = zapierDoc.data() as ZapierWebhook;

    if (!zapier.enabled || !zapier.triggerEvents.includes(eventType)) {
      console.log(
        `Zapier event ${eventType} not configured for user ${userId}`
      );
      return;
    }

    // Send webhook to Zapier
    const payload = {
      event: eventType,
      userId,
      timestamp: Date.now(),
      data: eventData,
    };

    await axios.post(zapier.webhookUrl, payload, {
      headers: {
        "Content-Type": "application/json",
        "X-Zapier-Signature": generateZapierSignature(payload),
      },
      timeout: 10000,
    });

    console.log(`Zapier webhook triggered for event: ${eventType}`);
  } catch (error) {
    console.error(`Error triggering Zapier webhook: ${error}`);
    // Don't throw - webhook failure shouldn't block main operations
  }
}

/**
 * Generate signature for Zapier webhook verification
 */
function generateZapierSignature(payload: Record<string, any>): string {
  const crypto = require("crypto");
  const secret = process.env.ZAPIER_WEBHOOK_SECRET || "";
  const message = JSON.stringify(payload);

  return crypto
    .createHmac("sha256", secret)
    .update(message)
    .digest("base64");
}

/**
 * Handle incoming webhooks from Zapier
 */
export const handleZapierWebhook = functions.https.onRequest(async (req, res) => {
  try {
    // Verify Zapier signature
    const signature = req.headers["x-zapier-signature"] as string;
    if (!verifyZapierSignature(req.body, signature)) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }

    const { userId, action, data } = req.body;

    if (!userId) {
      res.status(400).json({ error: "Missing userId" });
      return;
    }

    const db = admin.firestore();

    // Log incoming action
    const eventId = `zapier-event-${Date.now()}`;
    await db
      .collection("users")
      .doc(userId)
      .collection("zapierEvents")
      .doc(eventId)
      .set({
        id: eventId,
        action,
        data,
        receivedAt: Date.now(),
        processed: false,
      });

    res.status(200).json({
      success: true,
      eventId,
      message: "Zapier action received and queued for processing",
    });
  } catch (error) {
    console.error("Error handling Zapier webhook:", error);
    res.status(500).json({ error: `Failed to handle Zapier webhook: ${error}` });
  }
});

/**
 * Verify Zapier webhook signature
 */
function verifyZapierSignature(payload: Record<string, any>, signature: string): boolean {
  try {
    const crypto = require("crypto");
    const secret = process.env.ZAPIER_WEBHOOK_SECRET || "";
    const message = JSON.stringify(payload);

    const expectedSignature = crypto
      .createHmac("sha256", secret)
      .update(message)
      .digest("base64");

    return signature === expectedSignature;
  } catch (error) {
    console.error("Error verifying Zapier signature:", error);
    return false;
  }
}
