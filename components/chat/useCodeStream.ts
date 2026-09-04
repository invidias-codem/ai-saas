"use client";

import { useState } from "react";
import axios from "axios";
import { CodeContext } from "./useCodeConversation";
import { CodeSelectedFile } from "./useCodeFileUpload";

/** Minimal message shape the code send pipeline needs (mirrors the page's Message). */
export interface CodeMessage {
  id?: string;
  role: "user" | "bot";
  text: string;
  timestamp: Date;
  fileData?: CodeSelectedFile;
}

interface UseCodeStreamOptions {
  messages: CodeMessage[];
  setMessages: React.Dispatch<React.SetStateAction<CodeMessage[]>>;
  selectedFile: CodeSelectedFile | null;
  saveToMemory: boolean;
  removeFile: () => void;
  codeModel: string | undefined;
  activeRepo: string | null;
  codeContext: CodeContext;
  conversationId: string | null;
  setError: (msg: string | null) => void;
  setLoading: (loading: boolean) => void;
  setShowGreeting: (v: boolean) => void;
  trackActivity: (key: "image" | "video" | "message") => void;
}

/**
 * Code-generator send pipeline: input text, non-streaming POST to /api/code,
 * payload construction (file attachment + saveToMemory + model + repo +
 * context), and loading/error flags.
 *
 * Extracted from code/page.tsx (C7). Unlike the chat monolith, `/api/code` is a
 * single non-streaming response (no SSE parser). `messages` stays in the
 * orchestrator (shared source of truth); this hook reads + appends via
 * `setMessages`.
 */
export function useCodeStream({
  messages,
  setMessages,
  selectedFile,
  saveToMemory,
  removeFile,
  codeModel,
  activeRepo,
  codeContext,
  conversationId,
  setError,
  setLoading,
  setShowGreeting,
  trackActivity,
}: UseCodeStreamOptions) {
  const [userInput, setUserInput] = useState("");

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setUserInput(e.target.value);
  };

  const handleSendMessage = async () => {
    const trimmedInput = userInput.trim();
    if (!trimmedInput && !selectedFile) return;

    setLoading(true);
    setError(null);
    setShowGreeting(false);

    let messageText = trimmedInput;
    if (selectedFile) {
      messageText += `\n\n[Analysing File: ${selectedFile.name}]`;
    }

    const userMessage: CodeMessage = {
      text: messageText,
      role: "user",
      timestamp: new Date(),
      fileData: selectedFile
        ? {
            name: selectedFile.name,
            type: selectedFile.type,
            base64Data: selectedFile.base64Data,
          }
        : undefined,
    };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setUserInput("");

    removeFile();

    try {
      const response = await axios.post("/api/code", {
        messages: newMessages.map((msg) => ({
          role: msg.role,
          text: msg.text,
          fileData: msg.fileData, // Pass stored file data for history reconstruction
        })),
        currentUserPrompt: trimmedInput,
        fileData: selectedFile,
        saveToMemory: saveToMemory, // Pass memory flag
        model: codeModel, // Pass selected model
        activeRepo: activeRepo, // Pass active GitHub repo context
        workspaceId: codeContext.workspaceId,
        operatingProfileId: codeContext.operatingProfileId,
        operatingProfileMode: codeContext.operatingProfileMode,
        conversationId,
      });

      const botMessage: CodeMessage = {
        text: response.data.text,
        role: "bot",
        timestamp: new Date(),
      };
      setMessages((prevMessages) => [...prevMessages, botMessage]);
    } catch (error: any) {
      console.error("[CODE_PAGE_ERROR]", error);
      if (error.response?.status === 401) {
        window.location.href = "/sign-in?redirect_url=" + encodeURIComponent(window.location.pathname);
        return;
      }
      setError(error.response?.data?.details || "Sorry, something went wrong processing your request.");
    } finally {
      setLoading(false);
      trackActivity("message");
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    } else if (e.key === "Tab" && !e.shiftKey) {
      e.preventDefault();
      const { selectionStart, selectionEnd, value } = e.currentTarget;
      setUserInput(value.substring(0, selectionStart) + "  " + value.substring(selectionEnd));
      e.currentTarget.selectionStart = e.currentTarget.selectionEnd = selectionStart + 2;
    }
  };

  return {
    userInput,
    setUserInput,
    handleInputChange,
    handleSendMessage,
    handleKeyPress,
  };
}