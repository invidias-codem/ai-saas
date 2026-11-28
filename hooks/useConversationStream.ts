'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// ---------------------------------------------------------------------------
// Stream framing (mirrors conversationEngine.ts onStep + done enqueue)
// ---------------------------------------------------------------------------
// Incremental chunks:     delimited by '\n\n'
// Terminal chunk:         JSON.stringify({ status, answer, trajectory })
//                         appended WITHOUT delimiter, stream closes after.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  isStreaming?: boolean;
}

interface UseConversationStreamOptions {
  consultantId: string;
  onIngestionStatusChange?: (status: 'processing' | 'complete' | 'error') => void;
}

interface UseConversationStreamReturn {
  messages: ConversationMessage[];
  isProcessing: boolean;
  ingestionStatus: 'processing' | 'complete' | 'error';
  activeSources: unknown[];
  trajectory: unknown[];
  sendMessage: (text: string) => Promise<void>;
  reset: () => void;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------
export function useConversationStream({
  consultantId,
  onIngestionStatusChange,
}: UseConversationStreamOptions): UseConversationStreamReturn {
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [ingestionStatus, setIngestionStatus] = useState<'processing' | 'complete' | 'error'>('processing');
  const [activeSources, setActiveSources] = useState<unknown[]>([]);
  const [trajectory, setTrajectory] = useState<unknown[]>([]);

  const abortRef = useRef<AbortController | null>(null);
  const streamingIdRef = useRef(0);

  // -------------------------------------------------------------------------
  // Stream reader: handles '\n\n' delimited incremental chunks + final JSON
  // -------------------------------------------------------------------------
  const readStream = useCallback(
    async (
      reader: ReadableStreamDefaultReader<Uint8Array>,
      decoder: TextDecoder,
      assistantMsgId: string,
    ): Promise<{ trajectory: unknown[] }> => {
      let buffer = '';
      let trajectory: unknown[] = [];

      while (true) {
        const { value, done: doneReading } = await reader.read();
        if (doneReading) break;

        buffer += decoder.decode(value, { stream: true });

        // Split on '\n\n' delimiter
        const chunks = buffer.split('\n\n');
        // Pop the last (possibly incomplete) segment back into the buffer
        buffer = chunks.pop() ?? '';

        for (const chunk of chunks) {
          const trimmed = chunk.trim();
          if (!trimmed) continue;

          // Attempt to intercept the final JSON payload
          if (trimmed.startsWith('{') && trimmed.includes('"status"')) {
            try {
              const payload = JSON.parse(trimmed) as { answer?: string; trajectory?: unknown[] };
              if (payload.answer !== undefined) {
                if (Array.isArray(payload.trajectory)) {
                  trajectory = payload.trajectory;
                }
                setMessages((prev) =>
                  prev.map((msg) =>
                    msg.id === assistantMsgId
                      ? { ...msg, content: payload.answer as string, isStreaming: false }
                      : msg,
                  ),
                );
                continue;
              }
            } catch {
              // fall through to text append on parse failure
            }
          }

          // Standard text chunk: append to the assistant's message
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? { ...msg, content: msg.content + trimmed + '\n\n' }
                : msg,
            ),
          );
        }
      }

      // Flush any remaining data in the buffer after the stream closes
      if (buffer.trim()) {
        try {
          const payload = JSON.parse(buffer.trim()) as { answer?: string; trajectory?: unknown[] };
          if (payload.answer !== undefined) {
            if (Array.isArray(payload.trajectory)) {
              trajectory = payload.trajectory;
            }
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId
                  ? { ...msg, content: payload.answer as string, isStreaming: false }
                  : msg,
              ),
            );
          } else {
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMsgId
                  ? { ...msg, content: msg.content + buffer, isStreaming: false }
                  : msg,
              ),
            );
          }
        } catch {
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMsgId
                ? { ...msg, content: msg.content + buffer, isStreaming: false }
                : msg,
            ),
          );
        }
      }

      return { trajectory };
    },
    [],
  );

  // -------------------------------------------------------------------------
  // sendMessage()
  // -------------------------------------------------------------------------
  const sendMessage = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;

      // Cancel any in-flight request
      if (abortRef.current) {
        abortRef.current.abort();
      }
      const controller = new AbortController();
      abortRef.current = controller;

      const streamingId = ++streamingIdRef.current;
      const isLatest = () => streamingId === streamingIdRef.current;

      setIsProcessing(true);
      setIngestionStatus('processing');

      // Optimistically add the user message
      const userMsgId = `user-${Date.now()}`;
      const assistantMsgId = `assistant-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        { id: userMsgId, role: 'user', content: trimmed },
        { id: assistantMsgId, role: 'assistant', content: '', isStreaming: true },
      ]);

      try {
        const response = await fetch('/api/conversation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{ role: 'user', text: trimmed }],
            workspaceId: consultantId,
          }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        // Extract and set the sources header
        const sourcesHeader = response.headers.get('X-Genie-Sources');
        if (sourcesHeader) {
          try {
            const parsed = JSON.parse(sourcesHeader);
            setActiveSources(Array.isArray(parsed) ? parsed : []);
            setIngestionStatus('complete');
            onIngestionStatusChange?.('complete');
          } catch (e) {
            console.error('Failed to parse X-Genie-Sources:', e);
            setIngestionStatus('error');
            onIngestionStatusChange?.('error');
          }
        } else {
          setIngestionStatus('complete');
          onIngestionStatusChange?.('complete');
        }

        const reader = response.body?.getReader();
        if (!reader) {
          throw new Error('Readable stream not available');
        }

        const decoder = new TextDecoder('utf-8');
        const { trajectory: streamTrajectory } = await readStream(reader, decoder, assistantMsgId);

        if (!isLatest()) return;

        // Capture trajectory for the "View Reasoning" toggle
        if (streamTrajectory.length > 0) {
          setTrajectory(streamTrajectory);
        }
      } catch (error) {
        if (!isLatest()) return;
        console.error('Stream failure:', error);
        setIngestionStatus('error');
        onIngestionStatusChange?.('error');

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMsgId
              ? { ...msg, content: msg.content + '\n\n**[Connection Interrupted]**', isStreaming: false }
              : msg,
          ),
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [consultantId, onIngestionStatusChange, readStream],
  );

  // -------------------------------------------------------------------------
  // reset()
  // -------------------------------------------------------------------------
  const reset = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setMessages([]);
    setIsProcessing(false);
    setIngestionStatus('processing');
    setActiveSources([]);
    setTrajectory([]);
    onIngestionStatusChange?.('processing');
  }, [onIngestionStatusChange]);

  // -------------------------------------------------------------------------
  // Cleanup
  // -------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  return { messages, sendMessage, isProcessing, ingestionStatus, activeSources, trajectory, reset };
}
