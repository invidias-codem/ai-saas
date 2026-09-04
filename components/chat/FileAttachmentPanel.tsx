"use client";

import { Paperclip, FileText, X } from "lucide-react";
import { FilePreview } from "@/components/FilePreview";
import { SelectedFile } from "./useFileUpload";

interface FileAttachmentPanelProps {
  selectedFile: SelectedFile | null;
  showFilePreview: boolean;
  onTogglePreview: () => void;
  onRemoveFile: () => void;
}

/**
 * Attachment UI layer: the floating preview pill (with expandable rich
 * preview) that appears above the composer when a file is selected.
 * All upload state and logic lives in `useFileUpload`; this component is
 * purely presentational. The mobile file-input trigger stays inline in the
 * composer (it shares the input's flex layout) via `fileInputRef`.
 */
export function FileAttachmentPanel({
  selectedFile,
  showFilePreview,
  onTogglePreview,
  onRemoveFile,
}: FileAttachmentPanelProps) {
  if (!selectedFile) return null;

  return (
    <div className="absolute bottom-full left-0 mb-3 w-full animate-in slide-in-from-bottom-2 fade-in">
      {/* Rich preview panel (image / PDF / text / docx / xlsx) */}
      {showFilePreview && (
        <div className="mb-2 max-w-md">
          <FilePreview
            file={selectedFile.file}
            maxHeight="40vh"
            showHeader={false}
            allowFullscreen
            allowDownload={false}
          />
        </div>
      )}

      <div className="inline-flex items-center gap-2 bg-background border border-border shadow-sm px-3 py-1.5 rounded-full text-xs font-medium text-foreground">
        <Paperclip className="h-3 w-3 text-indigo-500" />
        <span className="max-w-[150px] truncate">{selectedFile.name}</span>
        {selectedFile.isUploading && (
          <span className="text-[10px] text-muted-foreground">uploading…</span>
        )}
        <button
          type="button"
          onClick={onTogglePreview}
          className="text-muted-foreground hover:text-indigo-500 transition-colors"
          title={showFilePreview ? "Hide preview" : "Show preview"}
          aria-label={showFilePreview ? "Hide file preview" : "Show file preview"}
        >
          <FileText className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onRemoveFile}
          className="text-muted-foreground hover:text-destructive transition-colors ml-1"
          aria-label="Remove attached file"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}