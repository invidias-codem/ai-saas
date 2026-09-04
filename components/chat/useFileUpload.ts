"use client";

import { useRef, useState, ChangeEvent } from "react";
import axios from "axios";
import {
  compressBase64Payload,
  FileUploadPayload,
} from "@/lib/uploadCompression";

/**
 * Selected file structure. Used by the send pipeline to build the `fileData`
 * payload (either a GCS `fileUri` for large files or `base64Data` for small).
 */
export interface SelectedFile {
  file: File;
  preview: string;
  name: string;
  type: string;
  mimeType?: string;
  sizeBytes?: number;
  storageProvider?: string;
  base64Data?: string;
  fileUri?: string; // GCS URI for large files
  isUploading?: boolean;
}

const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/** The `fileData` payload shape sent to the chat/analyze endpoint. */
export type FilePayload = FileUploadPayload;

const LARGE_FILE_THRESHOLD = 4 * 1024 * 1024; // 4MB

/**
 * File attachment lifecycle: selection, smart upload (GCS direct for >4MB,
 * base64 for small files), preview toggling, and removal.
 *
 * Extracted from conversation/[id]/client.tsx (T2 — leaf slice, no edges).
 * Only owns the *upload* state transitions; the send pipeline (T6) consumes
 * `selectedFile` via `buildFilePayload()` and then calls `clearFile()`.
 *
 * @param onError external error reporter (surfaces upload failures to the UI).
 */
export function useFileUpload(onError: (msg: string) => void) {
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [showFilePreview, setShowFilePreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const hasFile = selectedFile !== null;

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      const isLargeFile = file.size > LARGE_FILE_THRESHOLD;

      const newFileState: SelectedFile = {
        file,
        preview: objectUrl,
        name: file.name,
        type: file.type,
        mimeType: file.type,
        sizeBytes: file.size,
        isUploading: isLargeFile,
      };

      setSelectedFile(newFileState);
      setShowFilePreview(false);

      if (isLargeFile) {
        // Smart Upload: GCS Direct
        try {
          // 1. Get Signed URL
          const signRes = await axios.post("/api/storage/sign", {
            filename: file.name,
            contentType: file.type,
          });

          const { uploadUrl, fileUri } = signRes.data;

          // 2. Upload to GCS
          const uploadRes = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": file.type },
            body: file,
          });

          if (!uploadRes.ok) {
            throw new Error(`Upload failed: ${uploadRes.statusText}`);
          }

          // 3. Update State
          setSelectedFile((prev) =>
            prev
              ? {
                  ...prev,
                  fileUri,
                  storageProvider: "gcs",
                  base64Data: undefined,
                  isUploading: false,
                }
              : null
          );
        } catch (err: any) {
          console.error("Smart Upload Failed:", err);
          onError("Failed to upload large file. Please try a smaller one.");
          URL.revokeObjectURL(objectUrl); // Clean up memory
          setSelectedFile(null);
        }
      } else {
        // Standard Upload: Base64
        const base64 = await readFileAsBase64(file);
        setSelectedFile((prev) => (prev ? { ...prev, base64Data: base64 } : null));
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const togglePreview = () => {
    setShowFilePreview((v) => !v);
  };

  const removeFile = () => {
    if (selectedFile?.preview) {
      URL.revokeObjectURL(selectedFile.preview); // Clean up object URL
    }
    setSelectedFile(null);
    setShowFilePreview(false);
  };

  const clearFile = () => {
    setSelectedFile(null);
    setShowFilePreview(false);
  };

  /** Builds the wire `fileData` payload from the current selection. */
  const buildFilePayload = (): FilePayload | undefined => {
    if (!selectedFile) return undefined;

    if (selectedFile.fileUri) {
      return {
        name: selectedFile.name,
        type: selectedFile.type,
        mimeType: selectedFile.mimeType || selectedFile.type,
        sizeBytes: selectedFile.sizeBytes,
        fileUri: selectedFile.fileUri,
        storageProvider: selectedFile.storageProvider || "gcs",
      };
    }

    if (selectedFile.base64Data) {
      return compressBase64Payload({
        name: selectedFile.name,
        type: selectedFile.type,
        mimeType: selectedFile.mimeType || selectedFile.type,
        sizeBytes: selectedFile.sizeBytes,
        base64Data: selectedFile.base64Data,
      });
    }

    return undefined;
  };

  return {
    selectedFile,
    showFilePreview,
    fileInputRef,
    hasFile,
    handleAttachClick,
    handleFileChange,
    togglePreview,
    removeFile,
    clearFile,
    buildFilePayload,
  };
}