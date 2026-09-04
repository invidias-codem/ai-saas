"use client";

import { ChangeEvent } from "react";
import { useTranslations } from "next-intl";
import { Plus, SendHorizontal } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { NeuralArchivalUploader, UploadedDoc } from "@/components/documents/NeuralArchivalUploader";
import { FileAttachmentPanel } from "@/components/chat/FileAttachmentPanel";
import { SelectedFile } from "@/components/chat/useFileUpload";
import { cn } from "@/lib/utils";

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
 * Composer UI: floating glassmorphic input area — file preview pill, attachment
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

  return (
    <div className="flex-none w-full p-4 bg-gradient-to-t from-background via-background to-transparent pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="max-w-3xl mx-auto relative">
        {/* File Preview Pill + expandable rich preview */}
        <FileAttachmentPanel
          selectedFile={selectedFile}
          showFilePreview={showFilePreview}
          onTogglePreview={togglePreview}
          onRemoveFile={removeFile}
        />

        {/* Input Container */}
        <div className="relative flex items-end gap-2 bg-muted/40 hover:bg-muted/60 focus-within:bg-background focus-within:ring-2 focus-within:ring-indigo-500/20 border border-border/50 rounded-[26px] p-2 transition-all duration-200 shadow-sm">
          {/* Left: attachment group (hidden on mobile, shown on desktop) */}
          <div className="hidden sm:block">
            <NeuralArchivalUploader
              workspaceId={workspaceId}
              docs={uploadedDocs}
              setDocs={setUploadedDocs}
            />
          </div>

          {/* Mobile: grouped + button for attachments */}
          <div className="sm:hidden relative">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="absolute inset-0 opacity-0 cursor-pointer"
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.md,.csv"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
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
            placeholder={
              swarmSuggestion ||
              (agentMode === "agentic"
                ? t("placeholderAgentic")
                : agentMode === "quality"
                  ? t("placeholderQuality")
                  : t("placeholderFast"))
            }
            className="flex-1 min-h-[44px] max-h-[200px] border-0 focus-visible:ring-0 resize-none py-3 px-2 bg-transparent text-[15px] placeholder:text-muted-foreground/70 transition-all duration-700"
            rows={1}
          />

          {/* Send button — always visible, never pushed off-screen */}
          <Button
            onClick={handleSendMessage}
            disabled={loading || (!userInput.trim() && !selectedFile && uploadedDocs.length === 0)}
            className={cn(
              "rounded-full h-9 w-9 shrink-0 transition-all duration-300 shadow-sm",
              userInput.trim() || selectedFile || uploadedDocs.length > 0
                ? "bg-indigo-600 hover:bg-indigo-700 text-white scale-100"
                : "bg-muted text-muted-foreground opacity-50 scale-95 pointer-events-none"
            )}
          >
            {loading ? (
              <div className="h-4 w-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
            ) : (
              <SendHorizontal className="h-5 w-5 ml-0.5" />
            )}
          </Button>
        </div>
        <div className="text-center mt-2">
          <p className="text-[10px] text-muted-foreground/60">
            AI can make mistakes. Check important info.
          </p>
        </div>
      </div>
    </div>
  );
}