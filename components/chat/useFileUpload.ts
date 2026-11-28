"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import axios from "axios";
import { compressBase64Payload, type FileUploadPayload } from "@/lib/uploadCompression";
import { MAX_CHAT_IMAGE_BYTES, MAX_CHAT_IMAGES } from "@/lib/types/attachments";
import { getChatImageMimeType, MAX_INLINE_CHAT_IMAGE_BYTES, prepareChatImage } from "@/lib/utils/chatImage";

export interface SelectedFile {
  id: string;
  file: File;
  name: string;
  type: string;
  isUploading: boolean;
  payload?: FileUploadPayload;
  error?: string;
  previewUrl?: string;
}

export type FilePayload = FileUploadPayload;

const LARGE_FILE_THRESHOLD = 4 * 1024 * 1024;
const MAX_PHOTO_BYTES = 20 * 1024 * 1024;
const MAX_CONCURRENT_PREPARATIONS = 3;

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

/**
 * One document or up to MAX_CHAT_IMAGES photos. The first individually chosen
 * photo may use the existing inline path; every additional photo uses GCS so
 * mobile/serverless request-body limits cannot be exceeded.
 */
export function useFileUpload(onError: (msg: string | null) => void) {
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const controllers = useRef(new Map<string, AbortController>());
  const previewUrls = useRef(new Map<string, string>());
  const cancelledIds = useRef(new Set<string>());
  const generation = useRef(0);

  useEffect(() => () => {
    controllers.current.forEach(controller => controller.abort());
    previewUrls.current.forEach(url => URL.revokeObjectURL(url));
    controllers.current.clear();
    previewUrls.current.clear();
  }, []);

  const processEntry = async (entry: SelectedFile, forceStoredImage: boolean) => {
    // The user may remove an item before the bounded worker reaches it.
    if (cancelledIds.current.has(entry.id)) return;
    const controller = new AbortController();
    controllers.current.set(entry.id, controller);
    const { signal } = controller;
    const photoType = getChatImageMimeType(entry.file);
    let failureMessage = photoType
      ? "Couldn’t prepare this photo. Try a JPEG, PNG, or another photo."
      : "Couldn’t read the file. Remove it and try again.";

    try {
      if (photoType && entry.file.size > MAX_PHOTO_BYTES) {
        failureMessage = "This photo is larger than 20 MB. Choose a smaller image.";
        throw new Error(failureMessage);
      }
      const prepared = photoType ? await prepareChatImage(entry.file, photoType) : entry.file;
      signal.throwIfAborted();
      if (photoType && prepared.size > MAX_CHAT_IMAGE_BYTES) {
        failureMessage = "This photo is too large to attach. Choose a smaller image.";
        throw new Error(failureMessage);
      }

      const mimeType = prepared.type || entry.type;
      const fileInfo = { name: prepared.name, type: mimeType, mimeType, sizeBytes: prepared.size };
      let payload: FileUploadPayload;
      const storeInGcs = (photoType && forceStoredImage)
        || prepared.size > (photoType ? MAX_INLINE_CHAT_IMAGE_BYTES : LARGE_FILE_THRESHOLD);

      if (storeInGcs) {
        failureMessage = "Couldn’t upload this file. Check your connection and retry.";
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
      setSelectedFiles(current => current.map(item => item.id === entry.id
        ? { ...item, file: prepared, type: mimeType, isUploading: false, payload, error: undefined }
        : item));
    } catch {
      if (!signal.aborted) {
        setSelectedFiles(current => current.map(item => item.id === entry.id
          ? { ...item, isUploading: false, payload: undefined, error: failureMessage }
          : item));
      }
    } finally {
      if (controllers.current.get(entry.id) === controller) controllers.current.delete(entry.id);
    }
  };

  const attachFiles = (files: File[]) => {
    if (files.length === 0) return;
    const currentHasDocument = selectedFiles.some(item => !getChatImageMimeType(item.file));
    const incomingHasDocument = files.some(file => !getChatImageMimeType(file));
    if ((currentHasDocument || incomingHasDocument) && (selectedFiles.length > 0 || files.length > 1)) {
      onError("Attach one document at a time, or select multiple images without documents.");
      return;
    }

    const remaining = MAX_CHAT_IMAGES - selectedFiles.length;
    if (remaining <= 0) {
      onError(`You can attach up to ${MAX_CHAT_IMAGES} images per message.`);
      return;
    }
    const admitted = files.slice(0, remaining);
    onError(files.length > remaining ? `Only ${MAX_CHAT_IMAGES} images can be attached to one message.` : null);
    const forceStoredImage = selectedFiles.length > 0 || admitted.length > 1;
    const entries: SelectedFile[] = admitted.map(file => {
      const id = crypto.randomUUID();
      const photoType = getChatImageMimeType(file);
      const previewUrl = photoType ? URL.createObjectURL(file) : undefined;
      if (previewUrl) previewUrls.current.set(id, previewUrl);
      return {
        id, file, name: file.name,
        type: photoType ?? (file.type || "application/octet-stream"),
        isUploading: true, previewUrl,
      };
    });
    setSelectedFiles(current => [...current, ...entries]);

    // Bounded workers prevent a multi-select from decoding ten camera photos at once.
    let index = 0;
    const batchGeneration = generation.current;
    void Promise.all(Array.from({ length: Math.min(MAX_CONCURRENT_PREPARATIONS, entries.length) }, async () => {
      while (index < entries.length && generation.current === batchGeneration) {
        const entry = entries[index++];
        if (!cancelledIds.current.has(entry.id)) await processEntry(entry, forceStoredImage);
      }
    }));
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    attachFiles(files);
  };

  const removeFile = (id: string) => {
    cancelledIds.current.add(id);
    controllers.current.get(id)?.abort();
    controllers.current.delete(id);
    const url = previewUrls.current.get(id);
    if (url) URL.revokeObjectURL(url);
    previewUrls.current.delete(id);
    setSelectedFiles(current => current.filter(item => item.id !== id));
    setPreviewFileId(current => current === id ? null : current);
  };

  const clearFile = () => {
    generation.current += 1;
    controllers.current.forEach(controller => controller.abort());
    controllers.current.clear();
    previewUrls.current.forEach(url => URL.revokeObjectURL(url));
    previewUrls.current.clear();
    setSelectedFiles([]);
    setPreviewFileId(null);
  };

  const retryFile = (id: string) => {
    const entry = selectedFiles.find(item => item.id === id);
    if (!entry || entry.isUploading) return;
    setSelectedFiles(current => current.map(item => item.id === id
      ? { ...item, isUploading: true, error: undefined } : item));
    // A retried photo is stored unless it is the only attachment, preventing
    // large inline bodies when other photos are present.
    void processEntry(entry, selectedFiles.length > 1);
  };

  return {
    selectedFiles,
    previewFileId,
    fileInputRef,
    attachFiles,
    handleFileChange,
    togglePreview: (id: string) => setPreviewFileId(value => value === id ? null : id),
    removeFile,
    retryFile,
    clearFile,
    buildFilePayloads: (): FilePayload[] | undefined =>
      selectedFiles.some(item => item.isUploading || !item.payload || item.error)
        ? undefined
        : selectedFiles.map(item => item.payload!),
  };
}
