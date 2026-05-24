import React, { useState, useRef } from 'react';
import axios from 'axios';
import { StorageState } from '@/lib/types/documents';
import { FileItem } from './FileItem';
import { Button } from '@/components/ui/button';
import { Paperclip, Loader2 } from 'lucide-react';

interface NeuralArchivalUploaderProps {
  workspaceId: string;
  onUploadComplete: (doc: any) => void;
}

export function NeuralArchivalUploader({ workspaceId, onUploadComplete }: NeuralArchivalUploaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [optimisticDocs, setOptimisticDocs] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }

    const tempId = `temp_${Date.now()}`;
    const newDoc = {
      id: tempId,
      filename: file.name,
      storageState: 'INGESTING' as const,
    };

    setOptimisticDocs(prev => [...prev, newDoc]);
    setIsOpen(false);

    try {
      // 1. Get signed URL
      const signRes = await axios.post('/api/storage/sign', {
        filename: file.name,
        contentType: file.type
      });

      const { uploadUrl, fileUri } = signRes.data;

      // 2. Upload to GCS directly
      await axios.put(uploadUrl, file, {
        headers: { 'Content-Type': file.type }
      });

      // 3. Trigger ingestion
      const uploadRes = await axios.post('/api/documents/upload', {
        workspaceId,
        filename: file.name,
        mimeType: file.type,
        storageUri: fileUri
      });

      const finalDoc = uploadRes.data;

      setOptimisticDocs(prev => prev.filter(d => d.id !== tempId));
      onUploadComplete(finalDoc);

    } catch (err) {
      console.error('[Uploader] Upload failed:', err);
      // In a real app, update state to ERROR
      setOptimisticDocs(prev => prev.filter(d => d.id !== tempId));
    }
  };

  return (
    <div className="relative">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="h-10 w-10 text-muted-foreground hover:text-foreground shrink-0 rounded-full bg-secondary/50 hover:bg-secondary"
          title="Upload Document"
        >
          <Paperclip className="h-5 w-5" />
        </Button>
      </div>

      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept=".pdf,.txt,.md,.csv,.json"
        onChange={handleFileChange}
      />

      {optimisticDocs.length > 0 && (
        <div className="absolute bottom-full left-0 mb-4 w-72 z-50">
          {optimisticDocs.map(doc => (
            <FileItem
              key={doc.id}
              id={doc.id}
              filename={doc.filename}
              storageState={doc.storageState}
            />
          ))}
        </div>
      )}
    </div>
  );
}
