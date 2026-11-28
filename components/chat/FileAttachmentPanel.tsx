"use client";

import { FileImage, FileText, Paperclip, RotateCcw, X } from "lucide-react";
import { FilePreview } from "@/components/FilePreview";
import type { SelectedFile } from "./useFileUpload";

interface FileAttachmentPanelProps {
  selectedFiles: SelectedFile[];
  previewFileId: string | null;
  onTogglePreview: (id: string) => void;
  onRemoveFile: (id: string) => void;
  onRetryFile: (id: string) => void;
  sending: boolean;
}

/** Per-file thumbnails, upload progress, removal and retry for touch and mouse. */
export function FileAttachmentPanel({
  selectedFiles,
  previewFileId,
  onTogglePreview,
  onRemoveFile,
  onRetryFile,
  sending,
}: FileAttachmentPanelProps) {
  if (!selectedFiles.length) return null;
  const preview = selectedFiles.find(file => file.id === previewFileId);

  return (
    <div className="mb-2 max-h-[40vh] overflow-y-auto overscroll-contain rounded-xl border border-border bg-card p-2 shadow-sm">
      {preview && (
        <div className="mb-2 max-w-md">
          <FilePreview
            file={preview.file}
            maxHeight="22vh"
            showHeader={false}
            allowFullscreen
            allowDownload={false}
          />
        </div>
      )}
      <div className="flex flex-wrap gap-2" role="group" aria-label="Attached files">
        {selectedFiles.map(file => (
          <div key={file.id} className="flex min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-border bg-background p-1.5 text-xs">
            <button
              type="button"
              onClick={() => onTogglePreview(file.id)}
              className="flex min-w-0 items-center gap-2 rounded-md text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
              aria-label={`Preview ${file.name}`}
              aria-expanded={previewFileId === file.id}
            >
              {file.previewUrl ? (
                // Blob URLs are produced locally from the user-selected File.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={file.previewUrl} alt="" className="h-12 w-12 shrink-0 rounded-md object-cover" />
              ) : file.type.startsWith("image/") ? (
                <FileImage className="h-8 w-8 shrink-0 text-primary" aria-hidden="true" />
              ) : (
                <Paperclip className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              )}
              <span className="max-w-28 truncate font-medium">{file.name}</span>
              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            </button>
            {file.isUploading && <span role="status" className="text-muted-foreground">Preparing…</span>}
            {file.error && (
              <div className="flex min-w-0 flex-col items-start gap-1">
                <span role="alert" className="max-w-40 text-destructive">{file.error}</span>
                <button
                  type="button"
                  disabled={sending}
                  onClick={() => onRetryFile(file.id)}
                  aria-label={`Retry ${file.name}`}
                  className="inline-flex items-center gap-1 rounded text-primary underline focus-visible:outline focus-visible:outline-2"
                >
                  <RotateCcw className="h-3 w-3" aria-hidden="true" /> Retry
                </button>
              </div>
            )}
            <button
              type="button"
              disabled={sending}
              onClick={() => onRemoveFile(file.id)}
              className="ml-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:text-destructive focus-visible:outline focus-visible:outline-2"
              aria-label={`Remove ${file.name}`}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
