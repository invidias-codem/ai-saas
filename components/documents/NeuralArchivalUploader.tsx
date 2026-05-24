import React, { useState, useRef } from 'react';
import axios from 'axios';
import { StorageState } from '@/lib/types/documents';
import { FileItem } from './FileItem';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { Button } from '@/components/ui/button';
import { Paperclip } from 'lucide-react';

export interface UploadedDoc {
  id: string;
  filename: string;
  storageState: StorageState | 'INGESTING' | 'ERROR';
  mimeType?: string;
}

interface NeuralArchivalUploaderProps {
  workspaceId?: string | null;
  docs: UploadedDoc[];
  setDocs: React.Dispatch<React.SetStateAction<UploadedDoc[]>>;
}

export function NeuralArchivalUploader({ workspaceId, docs, setDocs }: NeuralArchivalUploaderProps) {
  const [previewDoc, setPreviewDoc] = useState<{ id: string; filename: string } | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Reset input so the same file can be re-selected
    if (fileInputRef.current) fileInputRef.current.value = '';

    const tempId = `temp_${Date.now()}`;

    // 1. Show optimistic INGESTING card immediately
    setDocs(prev => [...prev, { id: tempId, filename: file.name, storageState: 'INGESTING', mimeType: file.type }]);

    try {
      // 2. Get GCS signed URL
      const signRes = await axios.post('/api/storage/sign', {
        filename: file.name,
        contentType: file.type,
      });
      const { uploadUrl, fileUri } = signRes.data;

      // 3. Upload binary directly to GCS
      await axios.put(uploadUrl, file, {
        headers: { 'Content-Type': file.type },
      });

      // 4. Trigger server-side ingestion (extract → chunk → embed → store)
      const uploadRes = await axios.post('/api/documents/upload', {
        workspaceId: workspaceId || null,
        filename: file.name,
        mimeType: file.type,
        storageUri: fileUri,
      });

      const serverDoc = uploadRes.data;

      const completedDoc: UploadedDoc = {
        id: serverDoc.id,
        filename: serverDoc.filename ?? file.name,
        storageState: StorageState.WARM,
        mimeType: file.type,
      };

      // 5. Replace the temp optimistic card with the real WARM card
      setDocs(prev => prev.map(d => d.id === tempId ? completedDoc : d));

    } catch (err) {
      console.error('[Uploader] Upload failed:', err);
      // Show error state on the card instead of silently disappearing
      setDocs(prev => prev.map(d => d.id === tempId ? { ...d, storageState: 'ERROR' } : d));
    }
  };

  const removeDoc = (id: string) => {
    setDocs(prev => prev.filter(d => d.id !== id));
  };

  const handlePreview = (id: string, filename: string) => {
    setPreviewDoc({ id, filename });
    setIsPreviewOpen(true);
  };

  return (
    <div className="relative">
      {/* Attached documents tray — shows above the button when docs exist */}
      {docs.length > 0 && (
        <div className="absolute bottom-full left-0 mb-3 w-72 z-50 space-y-1">
          {docs.map(doc => (
            <FileItem
              key={doc.id}
              id={doc.id}
              filename={doc.filename}
              storageState={doc.storageState as any}
              onRemove={doc.storageState !== 'INGESTING' ? () => removeDoc(doc.id) : undefined}
              onPreview={doc.storageState !== 'INGESTING' && doc.storageState !== 'ERROR' ? () => handlePreview(doc.id, doc.filename) : undefined}
            />
          ))}
        </div>
      )}

      {/* Upload trigger button */}
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="h-10 w-10 text-muted-foreground hover:text-foreground shrink-0 rounded-full bg-secondary/50 hover:bg-secondary"
          title="Attach Document"
          aria-label="Attach document"
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

      <DocumentPreviewModal
        isOpen={isPreviewOpen}
        onOpenChange={setIsPreviewOpen}
        documentId={previewDoc?.id || null}
        filename={previewDoc?.filename || ''}
      />
    </div>
  );
}
