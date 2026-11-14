"use client";

import { ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Plus, SendHorizontal } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { NeuralArchivalUploader, UploadedDoc } from "@/components/documents/NeuralArchivalUploader";
import { FileAttachmentPanel } from "@/components/chat/FileAttachmentPanel";
import { SelectedFile } from "@/components/chat/useFileUpload";

interface ComposerProps {
  workspaceId: string | null;
  userInput: string;
  loading: boolean;
  agentMode: string | undefined;
  swarmSuggestion: string;
  selectedFile: SelectedFile | null;
  showFilePreview: boolean;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  uploadedDocs: UploadedDoc[];
  setUploadedDocs: React.Dispatch<React.SetStateAction<UploadedDoc[]>>;
  handleInputChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  handleSendMessage: () => void;
  handleKeyPress: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handleFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  togglePreview: () => void;
  removeFile: () => void;
}

/**
 * Composer UI: file preview pill, attachment
 * controls, textarea, send button, and disclaimer footer. Pure form component:
 * all state and handlers arrive as props from `useChatStream`/`useFileUpload`.
 */
export function Composer({
  workspaceId,
  userInput,
  loading,
  agentMode,
  swarmSuggestion,
  selectedFile,
  showFilePreview,
  fileInputRef,
  uploadedDocs,
  setUploadedDocs,
  handleInputChange,
  handleSendMessage,
  handleKeyPress,
  handleFileChange,
  togglePreview,
  removeFile,
}: ComposerProps) {
  const t = useTranslations("Conversation");
  const canSend = Boolean(userInput.trim() || selectedFile || uploadedDocs.length);

  return (
    <div className="w-full flex-none bg-background px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4">
      <div className="max-w-3xl mx-auto relative">
        {/* File Preview Pill + expandable rich preview */}
        <FileAttachmentPanel
          selectedFile={selectedFile}
          showFilePreview={showFilePreview}
          onTogglePreview={togglePreview}
          onRemoveFile={removeFile}
        />

        {/* Input Container */}
        <div className="relative flex items-end gap-1.5 rounded-2xl border border-input bg-card p-2 shadow-sm focus-within:border-ring sm:gap-2">
          {/* Left: attachment group (hidden on mobile, shown on desktop) */}
          <div className="hidden sm:block">
            <NeuralArchivalUploader
              workspaceId={workspaceId}
              docs={uploadedDocs}
              setDocs={setUploadedDocs}
            />
          </div>

          {/* Mobile: grouped + button for attachments */}
          <div className="relative shrink-0 sm:hidden">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              hidden
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.md,.csv"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Attach a file"
              className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>

          <Textarea
            value={userInput}
            onChange={handleInputChange}
            onKeyDown={handleKeyPress}
            aria-label="Message Weaver"
            placeholder={
              swarmSuggestion ||
              (agentMode === "agentic"
                ? t("placeholderAgentic")
                : agentMode === "quality"
                  ? t("placeholderQuality")
                  : t("placeholderFast"))
            }
            className="min-h-11 min-w-0 max-h-[200px] flex-1 resize-none border-0 bg-transparent px-2 py-2.5 text-base shadow-none"
            rows={1}
          />

          {/* Send button — always visible, never pushed off-screen */}
          <Button
            type="button"
            variant={canSend ? "action" : "ghost"}
            size="icon"
            aria-label="Send message"
            aria-busy={loading}
            onClick={handleSendMessage}
            disabled={loading || !canSend}
            className="h-10 w-10 shrink-0 rounded-xl"
          >
            {loading ? (
              <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden="true" />
            ) : (
              <SendHorizontal className="h-5 w-5" aria-hidden="true" />
            )}
          </Button>
        </div>
        <div className="text-center mt-2">
          <p className="text-[11px] text-muted-foreground">
            AI can make mistakes. Check important info.
          </p>
        </div>
      </div>
    </div>
  );
}
