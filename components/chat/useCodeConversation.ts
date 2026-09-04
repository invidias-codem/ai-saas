"use client";

import { useEffect, useState } from "react";
import axios from "axios";
import { safeLocalStorage } from "@/lib/safeStorage";
import {
  getSessionMemoryFromStorage,
  saveSessionMemoryToStorage,
  SessionMessage,
} from "@/lib/sessionClientMemory";
import { createNewConversation } from "@/lib/conversationManager";

export interface CodeContext {
  workspaceId: string | null;
  workspaceName: string | null;
  operatingProfileId: string | null;
  operatingProfileName: string | null;
  operatingProfileMode: string | null;
}

interface CodeMessage {
  id?: string;
  text: string;
  role: "user" | "bot";
  timestamp: Date;
  fileData?: CodeSelectedFileLike;
}

interface CodeSelectedFileLike {
  name: string;
  type: string;
  base64Data: string;
}

const codeConversationRowKey = (
  workspaceId?: string | null,
  operatingProfileId?: string | null
) => `weaver_code_conversation_id:${workspaceId || "global"}:${operatingProfileId || "global"}`;

const getLocalCodeSessionId = (
  workspaceId?: string | null,
  operatingProfileId?: string | null
) => `local-code-session:${workspaceId || "global"}:${operatingProfileId || "global"}`;

const EMPTY_CONTEXT: CodeContext = {
  workspaceId: null,
  workspaceName: null,
  operatingProfileId: null,
  operatingProfileName: null,
  operatingProfileMode: null,
};

interface UseCodeConversationOptions {
  messages: CodeMessage[];
  onRestoreMessages: (messages: CodeMessage[]) => void;
  onHideGreeting: () => void;
}

/**
 * Code-generator context + conversation bootstrap: hydrate workspace/operating
 * profile via parallel fetches, resolve the row-backed conversation id (create
 * if absent), restore row-backed history (authoritative) with session-memory
 * fallback, and persist messages on change.
 *
 * Extracted from code/page.tsx (C6). `messages` is read-only here; the
 * orchestrator owns restore via callbacks. Exposes `codeContext` (for the send
 * pipeline + header chrome) and `conversationId` (for the send pipeline).
 */
export function useCodeConversation({
  messages,
  onRestoreMessages,
  onHideGreeting,
}: UseCodeConversationOptions) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [codeContext, setCodeContext] = useState<CodeContext>(EMPTY_CONTEXT);

  // Hydrate workspace + operating profile.
  useEffect(() => {
    const loadCodeContext = async () => {
      try {
        const [workspaceRes, profileRes] = await Promise.all([
          axios.get("/api/workspaces/default"),
          axios.get("/api/operating-profiles/default"),
        ]);

        const workspace = workspaceRes.data?.workspace ?? null;
        const profile = profileRes.data?.operatingProfile ?? null;

        setCodeContext({
          workspaceId: workspace?.id ?? null,
          workspaceName: workspace?.name ?? null,
          operatingProfileId: profile?.id ?? workspace?.default_operating_profile_id ?? null,
          operatingProfileName: profile?.name ?? null,
          operatingProfileMode: profile?.mode ?? null,
        });
      } catch (err) {
        console.error("[CODE_CONTEXT_LOAD_ERROR]", err);
      }
    };

    loadCodeContext();
  }, []);

  // Bootstrap the code conversation once context is available.
  useEffect(() => {
    const bootstrapCodeConversation = async () => {
      try {
        const conversationRowKey = codeConversationRowKey(
          codeContext.workspaceId,
          codeContext.operatingProfileId
        );
        let resolvedConversationId = safeLocalStorage.getItem(conversationRowKey);

        if (!resolvedConversationId && codeContext.workspaceId) {
          const created = await createNewConversation({
            title: codeContext.workspaceName
              ? `${codeContext.workspaceName} Code`
              : "Code Conversation",
            workspaceId: codeContext.workspaceId ?? undefined,
            operatingProfileId: codeContext.operatingProfileId ?? undefined,
          });

          if (created?.id) {
            resolvedConversationId = created.id;
            safeLocalStorage.setItem(conversationRowKey, created.id);
          }
        }

        if (resolvedConversationId) {
          setConversationId(resolvedConversationId);
          const response = await fetch(`/api/conversations/${resolvedConversationId}`, {
            credentials: "include",
          });
          if (response.ok) {
            const data = await response.json();
            const restoredMessages: CodeMessage[] = (data.messages || []).map((msg: any) => ({
              id: msg.id,
              text: msg.text,
              role: msg.role,
              timestamp: new Date(msg.timestamp),
              fileData: msg.fileData,
            }));

            // Authoritative rule: Row-backed history wins.
            onRestoreMessages(restoredMessages);
            if (restoredMessages.length > 0) {
              onHideGreeting();
            }
            return;
          }
        }

        // Only fall back to local storage if we absolutely could not establish
        // or fetch a conversation.
        const localSessionId = getLocalCodeSessionId(
          codeContext.workspaceId,
          codeContext.operatingProfileId
        );
        const savedMessages = getSessionMemoryFromStorage(localSessionId);
        if (savedMessages.length > 0) {
          const restoredMessages: CodeMessage[] = savedMessages.map((msg) => ({
            text: msg.text,
            role: msg.role,
            timestamp: new Date(msg.timestamp),
            fileData: msg.fileData,
          }));
          onRestoreMessages(restoredMessages);
          onHideGreeting();
        }
      } catch (err) {
        console.error("[CODE_CONVERSATION_BOOTSTRAP_ERROR]", err);
      }
    };

    if (codeContext.workspaceId || codeContext.operatingProfileId) {
      bootstrapCodeConversation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeContext.workspaceId, codeContext.operatingProfileId, codeContext.workspaceName]);

  // Save to storage on change.
  useEffect(() => {
    if (messages.length > 0) {
      const sessionMessages: SessionMessage[] = messages.map((msg) => ({
        text: msg.text,
        role: msg.role,
        timestamp: msg.timestamp.getTime(),
        fileData: msg.fileData,
      }));
      const localSessionId = getLocalCodeSessionId(
        codeContext.workspaceId,
        codeContext.operatingProfileId
      );
      saveSessionMemoryToStorage(sessionMessages, "current-user", "code-session", localSessionId);
    }
  }, [messages, codeContext.workspaceId, codeContext.operatingProfileId]);

  return {
    codeContext,
    conversationId,
  };
}