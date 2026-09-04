"use client";

import { useState } from "react";
import { Source } from "@/components/chat/SourceDisplay";
import { SelectedFile, FilePayload } from "./useFileUpload";

/** Minimal message shape the stream pipeline needs (mirrors the client's Message). */
export interface StreamMessage {
  text: string;
  role: "user" | "bot";
  timestamp: Date;
  sources?: Source[];
}

interface UseChatStreamOptions {
  conversationId: string;
  userId: string;
  agentMode: string | undefined;
  messages: StreamMessage[];
  setMessages: React.Dispatch<React.SetStateAction<StreamMessage[]>>;
  // File attachment (T2)
  selectedFile: SelectedFile | null;
  buildFilePayload: () => FilePayload | undefined;
  clearFile: () => void;
  uploadedDocs: { id: string }[];
  // External side-effects owned by the orchestrator
  setError: (msg: string | null) => void;
  setShowGreeting: (v: boolean) => void;
  setDebugExecutionMode: (v: string | undefined) => void;
  setDebugIntent: (v: string | undefined) => void;
  setShowFileGateNudge: (v: boolean) => void;
  openPricingModal: () => void;
  trackActivity: (key: "image" | "video" | "message") => void;
}

/**
 * Core streaming send pipeline: input text, submit dispatch, SSE/fetch stream
 * parsing, and the loading/streaming flags. Extracted from
 * conversation/[id]/client.tsx (T6).
 *
 * `messages` stays owned by the orchestrator (shared source of truth consumed
 * by supabase sync, session sync, memory, scroll, and the render tree) — this
 * hook reads it and appends through `setMessages`.
 */
export function useChatStream({
  conversationId,
  userId,
  agentMode,
  messages,
  setMessages,
  selectedFile,
  buildFilePayload,
  clearFile,
  uploadedDocs,
  setError,
  setShowGreeting,
  setDebugExecutionMode,
  setDebugIntent,
  setShowFileGateNudge,
  openPricingModal,
  trackActivity,
}: UseChatStreamOptions) {
  const [userInput, setUserInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setUserInput(e.target.value);
  };

  const handleSendMessage = async () => {
    const trimmedInput = userInput.trim();
    if (!trimmedInput && !selectedFile && uploadedDocs.length === 0) return;
    if (selectedFile?.isUploading) {
      setError("Please wait for file upload to complete.");
      return;
    }

    setLoading(true);
    setError(null);
    setShowGreeting(false);

    let messageText = trimmedInput;
    if (selectedFile) {
      messageText += `\n\n[Attached File: ${selectedFile.name} (${selectedFile.type})]`;
    }

    const userMessage: StreamMessage = { text: messageText, role: "user", timestamp: new Date() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setUserInput("");
    setStreaming(true);
    setStreamingContent("");

    // Capture file data before clearing state
    const filePayload = selectedFile ? buildFilePayload() : undefined;

    const analyzeUploadEndpoint = selectedFile ? "/api/analyze-upload" : "/api/chat";
    clearFile();

    try {
      // Dispatcher Call (Fetch with Streaming)
      const response = await fetch(analyzeUploadEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId,
          userId,
          prompt: messageText,
          fileData: filePayload,
          documentIds: uploadedDocs.map((d) => d.id), // Send the document IDs reference
          messages: newMessages.map((m) => ({ role: m.role, text: m.text })), // Send history for context
          mode: agentMode, // Pass the active agent mode
        }),
      });

      // Clear uploaded docs after successful send
      // Note: We keep uploadedDocs in state for RAG retrieval on follow-up turns
      // The conversation engine uses documentIds to retrieve relevant chunks
      // setUploadedDocs([]);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let accum = "";

      if (reader) {
        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          if (value) {
            const chunk = decoder.decode(value, { stream: true });
            accum += chunk;
            setStreamingContent((prev) => prev + chunk);
          }
        }
      }

      // Finalize message
      const sourcesHeader =
        response.headers.get("X-Weaver-Sources") || response.headers.get("X-Genie-Sources");
      let sources: Source[] = [];
      if (sourcesHeader) {
        try {
          sources = JSON.parse(sourcesHeader);
        } catch (e) {
          console.error("Failed to parse sources header", e);
        }
      }

      const debugExecutionMode = response.headers.get("X-Debug-Execution-Mode") || undefined;
      const debugIntent = response.headers.get("X-Debug-Intent") || undefined;
      setDebugExecutionMode(debugExecutionMode);
      setDebugIntent(debugIntent);

      // Check for pricing nudge trigger from server
      if (response.headers.get("x-trigger-nudge") === "true") {
        openPricingModal();
      }

      // Check for file upload gated — show mobile-friendly donation nudge
      if (response.headers.get("x-file-gated") === "true") {
        setShowFileGateNudge(true);
      }

      const cleanedAccum = accum
        .replace(/<thought_signature>[\s\S]*?<\/thought_signature>/gi, "")
        .trim();
      setMessages((prev) => [
        ...prev,
        { text: cleanedAccum, role: "bot", timestamp: new Date(), sources },
      ]);
      setStreamingContent("");
      setStreaming(false);
    } catch (error: any) {
      console.error("Error sending message:", error);
      if (error?.status === 401 || (error.response && error.response.status === 401)) {
        window.location.href = "/sign-in?redirect_url=" + encodeURIComponent(window.location.pathname);
        return;
      }
      setError(error.message || "Sorry, something went wrong.");
      setStreaming(false);
    } finally {
      setLoading(false);
      trackActivity("message");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  return {
    userInput,
    setUserInput,
    loading,
    streaming,
    streamingContent,
    handleInputChange,
    handleSendMessage,
    handleKeyPress,
  };
}