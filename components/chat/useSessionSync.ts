"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import {
  getSessionMemoryFromStorage,
  saveSessionMemoryToStorage,
  getOrCreateSessionId,
  SessionMessage,
} from "@/lib/sessionClientMemory";
import {
  getOrCreateDeviceId,
} from "@/lib/deviceIdentifier";
import {
  registerSyncSession,
  detectMultiDeviceLogin,
  trackMessageSent,
  MultiDeviceStatus,
} from "@/lib/deviceSync";
import { toSyncMessages } from "@/lib/messageMerge";

/** Minimal message shape the sync layer needs (mirrors the client's Message). */
export interface SyncedMessage {
  text: string;
  role: "user" | "bot";
  timestamp: Date;
}

interface UseSessionSyncOptions {
  conversationId: string;
  userId: string;
  messages: SyncedMessage[];
  onRestoreMessages: (messages: SyncedMessage[]) => void;
  onSetUserId: (userId: string) => void;
  onHideGreeting: () => void;
}

/**
 * Session + multi-device sync: session/device id resolution, session memory
 * restore/persist, and conversation-scoped cloud sync.
 *
 * Extracted from conversation/[id]/client.tsx (T3). Isolated state tree — the
 * hook owns ids/sync status and reaches into parent chat state only through
 * the provided callbacks (`messages` is read-only here; `userId` stays in the
 * parent since the send pipeline needs it).
 */
export function useSessionSync({
  conversationId,
  userId,
  messages,
  onRestoreMessages,
  onSetUserId,
  onHideGreeting,
}: UseSessionSyncOptions) {
  const [sessionId, setSessionId] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [sessionRestored, setSessionRestored] = useState(false);
  const [multiDeviceStatus, setMultiDeviceStatus] =
    useState<MultiDeviceStatus | null>(null);

  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // --- Session & Sync Effects (Identical Logic to your original) ---
  useEffect(() => {
    const initializeSession = async () => {
      try {
        const sid = getOrCreateSessionId();
        setSessionId(sid);
        const did = getOrCreateDeviceId();
        setDeviceId(did);
        const savedMessages = getSessionMemoryFromStorage(conversationId); // Pass conversation ID
        if (savedMessages.length > 0) {
          const restoredMessages: SyncedMessage[] = savedMessages.map((msg) => ({
            text: msg.text,
            role: msg.role,
            timestamp: new Date(msg.timestamp),
          }));
          onRestoreMessages(restoredMessages);
          onHideGreeting();
        }
        try {
          const response = await fetch("/api/auth/user");
          if (response.ok) {
            const data = await response.json();
            onSetUserId(data.userId);
            registerSyncSession(data.userId, savedMessages.length);
            const status = detectMultiDeviceLogin(data.userId);
            setMultiDeviceStatus(status);
          }
        } catch (err) {
          console.warn("[DeviceSync] Could not fetch user info:", err);
        }
        setSessionRestored(true);
      } catch (err) {
        console.error("[SessionMemory] Failed:", err);
        setSessionRestored(true);
      }
    };
    initializeSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  useEffect(() => {
    if (!sessionRestored || !sessionId || messages.length === 0 || !conversationId) {
      return;
    }

    const sessionMessages: SessionMessage[] = messages.map((msg) => ({
      text: msg.text,
      role: msg.role,
      timestamp: msg.timestamp.getTime(),
    }));
    saveSessionMemoryToStorage(sessionMessages, "current-user", sessionId, conversationId); // Include conversationId
    if (deviceId) trackMessageSent(messages.length);
  }, [messages, sessionRestored, sessionId, deviceId, conversationId]);

  // Conversation-scoped cloud sync for multi-device support
  useEffect(() => {
    if (!sessionRestored || !userId || !deviceId || messages.length === 0 || !conversationId) return;

    const syncToCloud = async () => {
      try {
        const messagesToSync = messages.map((msg) => ({
          text: msg.text,
          role: msg.role,
          timestamp: msg.timestamp.getTime(),
        }));
        const syncMessages = toSyncMessages(messagesToSync, deviceId);

        // IMPORTANT: Pass conversationId to scope sync to THIS conversation only
        const response = await axios.post("/api/sync/conversation", {
          deviceId,
          messages: syncMessages,
          isNewDevice: false,
          lastSyncTimestamp: Date.now(),
          conversationId, // <-- Conversation-scoped sync!
        });

        if (response.data.merged) {
          const mergedMessages: SyncedMessage[] = response.data.merged.map(
            (m: { text: string; role: "user" | "bot"; timestamp: number }) => ({
              text: m.text,
              role: m.role,
              timestamp: new Date(m.timestamp),
            })
          );
          // Only update if we got MORE messages (from another device)
          if (mergedMessages.length > messages.length) {
            onRestoreMessages(mergedMessages);
            saveSessionMemoryToStorage(
              mergedMessages.map((msg) => ({
                text: msg.text,
                role: msg.role,
                timestamp: msg.timestamp.getTime(),
              })),
              "current-user",
              sessionId,
              conversationId
            );
          }
          if (response.data.deviceCount > 1) {
            setMultiDeviceStatus({
              isMultiDevice: true,
              deviceCount: response.data.deviceCount,
            } as MultiDeviceStatus);
          }
        }
      } catch (err: any) {
        console.warn("[DeviceSync] Sync failed:", err);
      }
    };

    // Initial sync after 10 seconds, then every 5 minutes
    const initialTimeout = setTimeout(syncToCloud, 10000);
    const syncInterval = setInterval(syncToCloud, 5 * 60 * 1000);
    syncIntervalRef.current = syncInterval;

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(syncInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionRestored, userId, deviceId, messages, sessionId, conversationId]);

  return {
    sessionId,
    deviceId,
    multiDeviceStatus,
    sessionRestored,
  };
}