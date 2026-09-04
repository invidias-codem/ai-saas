"use client";

import { useRef, useState, ChangeEvent } from "react";

/** Base64-only file shape for the code generator (no GCS/fileUri split). */
export interface CodeSelectedFile {
  name: string;
  type: string;
  base64Data: string;
}

const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64String = (reader.result as string).split(",")[1];
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

/**
 * Code-generator file attachment lifecycle: base64 read, selection, the
 * "save to knowledge base" toggle, and removal.
 *
 * Extracted from code/page.tsx (C2). Unlike the chat monolith's
 * `useFileUpload`, this path is base64-only (no GCS direct upload for large
 * files) and carries a `saveToMemory` flag consumed by the send pipeline.
 *
 * @param onError external error reporter (surfaces read failures).
 * @param onLoading external loading-flag setter (the read is async and blocks).
 */
export function useCodeFileUpload(
  onError: (msg: string | null) => void,
  onLoading: (loading: boolean) => void
) {
  const [selectedFile, setSelectedFile] = useState<CodeSelectedFile | null>(null);
  const [saveToMemory, setSaveToMemory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleAttachClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onLoading(true);
      onError(null);
      try {
        const base64Data = await readFileAsBase64(file);
        setSelectedFile({
          name: file.name,
          type: file.type || "text/plain",
          base64Data,
        });
      } catch (err) {
        console.error("Error reading file:", err);
        onError("Sorry, could not read the selected file.");
        setSelectedFile(null);
      } finally {
        onLoading(false);
      }
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeFile = () => {
    setSelectedFile(null);
  };

  return {
    selectedFile,
    saveToMemory,
    setSaveToMemory,
    fileInputRef,
    handleAttachClick,
    handleFileChange,
    removeFile,
  };
}