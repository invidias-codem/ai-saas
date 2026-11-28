"use client";

import type { ChangeEvent, ClipboardEvent, DragEvent } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Plus, SendHorizontal } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { NeuralArchivalUploader, UploadedDoc } from "@/components/documents/NeuralArchivalUploader";
import { FileAttachmentPanel } from "@/components/chat/FileAttachmentPanel";
import type { SelectedFile } from "@/components/chat/useFileUpload";
import { getChatImageMimeType } from "@/lib/utils/chatImage";

interface ComposerProps {
  workspaceId: string | null;
  userInput: string;
  loading: boolean;
  agentMode: string | undefined;
  swarmSuggestion: string;
  selectedFiles: SelectedFile[];
  previewFileId: string | null;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  uploadedDocs: UploadedDoc[];
  setUploadedDocs: React.Dispatch<React.SetStateAction<UploadedDoc[]>>;
  handleInputChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  handleSendMessage: () => void;
  handleKeyPress: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  handleFileChange: (e: ChangeEvent<HTMLInputElement>) => void;
  attachFiles: (files: File[]) => void;
  togglePreview: (id: string) => void;
  removeFile: (id: string) => void;
  retryFile: (id: string) => void;
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
  selectedFiles,
  previewFileId,
  fileInputRef,
  uploadedDocs,
  setUploadedDocs,
  handleInputChange,
  handleSendMessage,
  handleKeyPress,
  handleFileChange,
  attachFiles,
  togglePreview,
  removeFile,
  retryFile,
}: ComposerProps) {
  const t = useTranslations("Conversation");
  const canSend = Boolean(userInput.trim() || selectedFiles.length || uploadedDocs.length);
  const attachmentPending = selectedFiles.some(file => file.isUploading || !file.payload || Boolean(file.error));

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (loading) return;
    const { files, items } = event.clipboardData;
    const fromFiles = Array.from(files).filter(file => Boolean(getChatImageMimeType(file)));
    const images = fromFiles.length
      ? fromFiles
      : Array.from(items, item => item.getAsFile()).filter((file): file is File => Boolean(file && getChatImageMimeType(file)));
    if (!images.length) return;
    // Preserve text in a mixed clipboard paste.
    if (!event.clipboardData.getData("text/plain")) event.preventDefault();
    attachFiles(images);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    if (loading || !event.dataTransfer.files.length) return;
    event.preventDefault();
    attachFiles(Array.from(event.dataTransfer.files));
  };

  const handleDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!loading && Array.from(event.dataTransfer.types).includes("Files")) event.preventDefault();
  };

  return (
    <div
      className="w-full flex-none bg-background px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-4"
      onDrop={handleDrop}
      onDragOver={handleDragOver}
    >
      <div className="max-w-3xl mx-auto relative">
        {/* File Preview Pill + expandable rich preview */}
        <FileAttachmentPanel
          selectedFiles={selectedFiles}
          previewFileId={previewFileId}
          onTogglePreview={togglePreview}
          onRemoveFile={removeFile}
          onRetryFile={retryFile}
          sending={loading}
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

          <div className="relative shrink-0">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              hidden
              multiple
              accept="image/*,.heic,.heif,.pdf,.doc,.docx,.xls,.xlsx,.txt,.md,.csv"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Attach photo or file"
              disabled={loading}
              className="h-11 w-11 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
              onClick={() => fileInputRef.current?.click()}
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>

          <Textarea
            value={userInput}
            onChange={handleInputChange}
            onKeyDown={handleKeyPress}
            onPaste={handlePaste}
            readOnly={loading && selectedFiles.length > 0}
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
            disabled={loading || attachmentPending || !canSend}
            className="h-11 w-11 shrink-0 rounded-xl"
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
