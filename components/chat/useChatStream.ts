"use client";

import { useRef, useState } from "react";
import { Source } from "@/components/chat/SourceDisplay";
import type { SelectedFile, FilePayload } from "./useFileUpload";
import { MediaEnvelope, decodeMediaEvent, ApprovalEnvelope, decodeApprovalEvent, ModelSwitchEvent, decodeModelSwitchEvent, ProviderErrorEvent, decodeProviderErrorEvent } from "@/lib/media/envelope";

/**
 * Extract the agentic ReAct "donePayload" from an accumulated stream.
 *
 * The agentic path enqueues a raw JSON object at the end of the stream:
 * `{"status":"success","answer":"...","trajectory":[...]}`. This sniffs for
 * that trailing JSON envelope and returns its `answer` (falling back to
 * `status`), or null when the stream is plain prose (standard chat path).
 */
function extractDonePayload(accum: string): { status?: string; answer?: string } | null {
  const trimmed = accum.trimEnd();
  if (!trimmed.endsWith("}")) return null;

  const idx = trimmed.lastIndexOf('{"status":');
  if (idx === -1) return null;

  const candidate = trimmed.slice(idx);
  try {
    const parsed = JSON.parse(candidate);
    if (parsed && typeof parsed === "object" && "answer" in parsed) {
      return {
        status: typeof parsed.status === "string" ? parsed.status : undefined,
        answer: typeof parsed.answer === "string" ? parsed.answer : undefined,
      };
    }
  } catch {
    // Not a valid JSON envelope — fall through to prose handling.
  }
  return null;
}

/** Minimal message shape the stream pipeline needs (mirrors the client's Message). */
export interface StreamMessage {
  text: string;
  role: "user" | "bot";
  timestamp: Date;
  sources?: Source[];
  media?: MediaEnvelope[];
  approvalRequest?: ApprovalEnvelope;
  modelSwitch?: ModelSwitchEvent;
  providerError?: ProviderErrorEvent;
}

interface UseChatStreamOptions {
  conversationId: string;
  userId: string;
  agentMode: string | undefined;
  messages: StreamMessage[];
  setMessages: React.Dispatch<React.SetStateAction<StreamMessage[]>>;
  // File attachment (T2)
  selectedFiles: SelectedFile[];
  buildFilePayloads: () => FilePayload[] | undefined;
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
  selectedFiles,
  buildFilePayloads,
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
  const sending = useRef(false);
  const [userInput, setUserInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setUserInput(e.target.value);
  };

  const handleSendMessage = async () => {
    if (sending.current) return;
    const trimmedInput = userInput.trim();
    if (!trimmedInput && selectedFiles.length === 0 && uploadedDocs.length === 0) return;
    const filePayloads = buildFilePayloads();
    if (selectedFiles.length > 0 && !filePayloads) return;
    const hasFiles = Boolean(filePayloads?.length);

    sending.current = true;
    setLoading(true);
    setError(null);
    setShowGreeting(false);

    let messageText = trimmedInput;
    if (selectedFiles.length) {
      if (!messageText) {
        messageText = selectedFiles.every(file => file.type.startsWith("image/"))
          ? (selectedFiles.length > 1 ? "Describe the attached images." : "Describe the attached image.")
          : "Analyze the attached file.";
      }
      messageText += selectedFiles.map(file => `\n\n[Attached File: ${file.name} (${file.type})]`).join("");
    }

    const userMessage: StreamMessage = { text: messageText, role: "user", timestamp: new Date() };
    const newMessages = [...messages, userMessage];
    if (!hasFiles) {
      setMessages(newMessages);
      setUserInput("");
    }
    setStreaming(true);
    setStreamingContent("");

    const endpoint = hasFiles ? "/api/analyze-upload" : "/api/chat";

    try {
      // Dispatcher Call (Fetch with Streaming)
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId,
          userId,
          prompt: messageText,
          fileData: filePayloads?.length === 1 ? filePayloads[0] : undefined,
          fileDataList: filePayloads && filePayloads.length > 1 ? filePayloads : undefined,
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
        if (response.status === 401) {
          window.location.href = "/sign-in?redirect_url=" + encodeURIComponent(window.location.pathname);
          return;
        }
        if (hasFiles) {
          const failure = await response.json().catch(() => null);
          throw new Error(failure?.message || "Couldn’t analyze the attachment. Try sending it again.");
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      if (hasFiles) {
        setMessages(newMessages);
        setUserInput("");
        clearFile();
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
            // Withhold transport markers from the LIVE text — a provider-error
            // marker must never render as prose while streaming (it is parsed
            // and surfaced as metadata at finalization).
            setStreamingContent((prev) => {
              const next = prev + chunk;
              return next.replace(/__PROVIDER_ERROR_EVENT__:[^\n]*\n?/g, "");
            });
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

      // Extract structured media events (emitted by the agent engine) from the
      // stream, stripping them from prose so they don't render as raw text.
      const mediaLines: MediaEnvelope[] = [];
      let accumWithoutMedia = accum;
      const mediaEventLines = accum.match(/__MEDIA_EVENT__[^\n]*\n?/g) ?? [];
      for (const line of mediaEventLines) {
        const envelope = decodeMediaEvent(line.trim());
        if (envelope) mediaLines.push(envelope);
      }
      if (mediaLines.length > 0) {
        accumWithoutMedia = accum.replace(/__MEDIA_EVENT__[^\n]*\n?/g, "");
      }

      // Extract any human-in-the-loop approval request.
      let approvalRequest: ApprovalEnvelope | undefined;
      const approvalEventMatch = accumWithoutMedia.match(/__APPROVAL_EVENT__[^\n]*\n?/);
      if (approvalEventMatch) {
        approvalRequest = decodeApprovalEvent(approvalEventMatch[0].trim()) ?? undefined;
        if (approvalRequest) {
          accumWithoutMedia = accumWithoutMedia.replace(/__APPROVAL_EVENT__[^\n]*\n?/g, "");
        }
      }

      // Extract the model-switch sentinel (emitted by the fallback router BEFORE
      // the fallback stream). Strip it so it does not render as prose; surface it
      // as structured metadata on the message for an inline transition indicator.
      let modelSwitch: ModelSwitchEvent | undefined;
      const modelSwitchMatch = accumWithoutMedia.match(/__MODEL_SWITCH_EVENT__:[^\n]*\n?/);
      if (modelSwitchMatch) {
        modelSwitch = decodeModelSwitchEvent(modelSwitchMatch[0].trim()) ?? undefined;
        if (modelSwitch) {
          accumWithoutMedia = accumWithoutMedia.replace(/__MODEL_SWITCH_EVENT__:[^\n]*\n?/g, "");
        }
      }

      // Provider died mid-stream after output started: the provider enqueued a
      // structured marker + clean close (never an error()'d stream). Surface
      // it as an inline notice, strip it from the prose.
      let providerError: ProviderErrorEvent | undefined;
      const providerErrorMatch = accumWithoutMedia.match(/__PROVIDER_ERROR_EVENT__:[^\n]*\n?/);
      if (providerErrorMatch) {
        providerError = decodeProviderErrorEvent(providerErrorMatch[0].trim()) ?? undefined;
        accumWithoutMedia = accumWithoutMedia.replace(/__PROVIDER_ERROR_EVENT__:[^\n]*\n?/g, "");
      }

      // Agentic (ReAct) responses enqueue a terminal JSON "donePayload"
      // ({ status, answer, trajectory }) rather than streaming prose. Sniff the
      // trailing JSON envelope and surface only the clean `answer` so the user
      // never sees raw payload JSON or truncated-manifest noise.
      let cleanedAccum = accumWithoutMedia;
      const donePayload = extractDonePayload(accumWithoutMedia);
      if (donePayload) {
        cleanedAccum = donePayload.answer ?? donePayload.status ?? '';
      }

      cleanedAccum = cleanedAccum
        .replace(/<thought_signature>[\s\S]*?<\/thought_signature>/gi, "")
        .trim();
      setMessages((prev) => [
        ...prev,
        {
          text: cleanedAccum,
          role: "bot",
          timestamp: new Date(),
          sources,
          ...(mediaLines.length > 0 ? { media: mediaLines } : {}),
          ...(approvalRequest ? { approvalRequest } : {}),
          ...(modelSwitch ? { modelSwitch } : {}),
          ...(providerError ? { providerError } : {}),
        },
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
      sending.current = false;
      setLoading(false);
      setStreaming(false);
      trackActivity("message");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
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