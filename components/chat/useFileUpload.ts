"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import axios from "axios";
import { compressBase64Payload, type FileUploadPayload } from "@/lib/uploadCompression";
import { MAX_CHAT_IMAGE_BYTES } from "@/lib/types/attachments";
import { getChatImageMimeType, MAX_INLINE_CHAT_IMAGE_BYTES, prepareChatImage } from "@/lib/utils/chatImage";

export interface SelectedFile {
  file: File;
  name: string;
  type: string;
  isUploading: boolean;
  payload?: FileUploadPayload;
  error?: string;
}

export type FilePayload = FileUploadPayload;

const LARGE_FILE_THRESHOLD = 4 * 1024 * 1024;
const MAX_PHOTO_BYTES = 20 * 1024 * 1024;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const data = typeof reader.result === "string" ? reader.result.split(",")[1] : undefined;
      if (data) resolve(data);
      else reject(new Error("The file is empty."));
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function useFileUpload(onError: (msg: string | null) => void) {
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [showFilePreview, setShowFilePreview] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingUpload = useRef<AbortController | null>(null);

  useEffect(() => () => pendingUpload.current?.abort(), []);

  const attachFile = async (file: File) => {
    pendingUpload.current?.abort();
    const controller = new AbortController();
    pendingUpload.current = controller;
    const { signal } = controller;
    const photoType = getChatImageMimeType(file);
    const type = photoType ?? (file.type || "application/octet-stream");
    const selection = { file, name: file.name, type };

    onError(null);
    setShowFilePreview(false);
    setSelectedFile({ ...selection, isUploading: true });

    let failureMessage = photoType
      ? "Couldn’t prepare this photo. Try a JPEG, PNG, or another photo."
      : "Couldn’t read the file. Remove it and try again.";

    try {
      if (photoType && file.size > MAX_PHOTO_BYTES) {
        failureMessage = "This photo is larger than 20 MB. Choose a smaller image.";
        throw new Error(failureMessage);
      }

      const prepared = photoType ? await prepareChatImage(file, photoType) : file;
      signal.throwIfAborted();
      if (photoType && prepared.size > MAX_CHAT_IMAGE_BYTES) {
        failureMessage = "This photo is too large to attach. Choose a smaller image.";
        throw new Error(failureMessage);
      }
      const mimeType = prepared.type || type;
      const fileInfo = { name: prepared.name, type: mimeType, mimeType, sizeBytes: prepared.size };
      let payload: FileUploadPayload;

      if (prepared.size > (photoType ? MAX_INLINE_CHAT_IMAGE_BYTES : LARGE_FILE_THRESHOLD)) {
        failureMessage = "Couldn’t upload this file. Check your connection or choose a smaller file.";
        const { data: { uploadUrl, fileUri } } = await axios.post<{ uploadUrl: string; fileUri: string }>(
          "/api/storage/sign", { filename: prepared.name, contentType: mimeType }, { signal }
        );
        const response = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": mimeType },
          body: prepared,
          signal,
        });
        if (!response.ok) throw new Error("Direct upload failed");
        payload = { ...fileInfo, fileUri, storageProvider: "gcs" };
      } else {
        const inlinePayload = { ...fileInfo, base64Data: await readFileAsBase64(prepared) };
        payload = photoType ? inlinePayload : compressBase64Payload(inlinePayload);
      }
      signal.throwIfAborted();
      setSelectedFile({ file: prepared, name: file.name, type: mimeType, isUploading: false, payload });
    } catch {
      if (!signal.aborted) {
        setSelectedFile({ ...selection, isUploading: false, error: failureMessage });
      }
    } finally {
      if (pendingUpload.current === controller) pendingUpload.current = null;
    }
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (file) void attachFile(file);
  };

  const clearFile = () => {
    pendingUpload.current?.abort();
    pendingUpload.current = null;
    setSelectedFile(null);
    setShowFilePreview(false);
  };

  return {
    selectedFile,
    showFilePreview,
    fileInputRef,
    attachFile,
    handleFileChange,
    togglePreview: () => setShowFilePreview((value) => !value),
    clearFile,
    buildFilePayload: () => pendingUpload.current ? undefined : selectedFile?.payload,
  };
}
