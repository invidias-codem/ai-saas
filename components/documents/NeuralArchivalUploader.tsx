import React, { useState, useRef } from 'react';
import axios from 'axios';
import { StorageState } from '@/lib/types/documents';
import { FileItem } from './FileItem';
import { DocumentPreviewModal } from './DocumentPreviewModal';
import { Button } from '@/components/ui/button';
import { Paperclip } from 'lucide-react';
import { scrubImageMetadata } from '@/lib/utils/imageScrubber';

export interface UploadedDoc {
  id: string;
  filename: string;
  storageState: StorageState | 'INGESTING' | 'ERROR' | 'PREMIUM_REQUIRED';
  mimeType?: string;
  cta?: { label: string; href: string };
  message?: string;
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

    // Client-side size guard (10MB). GCS also enforces this via the signed URL,
    // but we catch it early to show a friendlier error message.
    const MAX_BYTES = 10 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      setDocs(prev => [...prev, { id: `temp_${Date.now()}`, filename: file.name, storageState: 'ERROR', mimeType: file.type }]);
      return;
    }

    const tempId = `temp_${Date.now()}`;

    // 1. Resolve MIME type — iOS Safari sometimes reports blank type for HEIC photos
    let finalMimeType = file.type;
    let finalFilename = file.name;
    if (!finalMimeType) {
      const ext = finalFilename.split('.').pop()?.toLowerCase();
      const extMap: Record<string, string> = {
        heic: 'image/heic', heif: 'image/heif',
        jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif',
        pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', csv: 'text/csv',
        mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm',
        mp3: 'audio/mpeg', m4a: 'audio/x-m4a', wav: 'audio/wav', aac: 'audio/aac', amr: 'audio/amr',
      };
      finalMimeType = ext ? (extMap[ext] || 'application/octet-stream') : 'application/octet-stream';
    }

    // 2. Show optimistic INGESTING card immediately
    setDocs(prev => [...prev, { id: tempId, filename: file.name, storageState: 'INGESTING', mimeType: finalMimeType }]);

    try {
      let uploadPayload: Blob | File = file;

      if (finalMimeType.startsWith('image/')) {
        // Only scrub natively supported web images. HEIC/HEIF cannot be drawn to canvas on most browsers.
        if (['image/jpeg', 'image/png', 'image/webp'].includes(finalMimeType)) {
          // Scrub EXIF and resize image
          const scrubbedBlob = await scrubImageMetadata(file);
          uploadPayload = scrubbedBlob;
          finalMimeType = 'image/jpeg'; // scrubber currently outputs jpeg
          if (!finalFilename.toLowerCase().endsWith('.jpg') && !finalFilename.toLowerCase().endsWith('.jpeg')) {
             finalFilename = finalFilename.replace(/\.[^/.]+$/, "") + ".jpeg";
          }
        }
      }
      // 2. Get GCS signed URL
      const signRes = await axios.post('/api/storage/sign', {
        filename: finalFilename,
        contentType: finalMimeType,
      });
      const { uploadUrl, fileUri } = signRes.data;

      // 3. Upload binary directly to GCS
      // IMPORTANT: Do NOT include x-goog-* extension headers in the PUT request.
      // These headers trigger a CORS preflight on mobile browsers, which GCS blocks
      // for signed URL PUT operations. The size limit is already baked into the signed URL.
      await axios.put(uploadUrl, uploadPayload, {
        headers: { 
          'Content-Type': finalMimeType,
        },
      });

      // 4. Trigger server-side ingestion (extract → chunk → embed → store)
      const uploadRes = await axios.post('/api/documents/upload', {
        workspaceId: workspaceId || null,
        filename: finalFilename,
        mimeType: finalMimeType,
        storageUri: fileUri,
      });

      const serverDoc = uploadRes.data;

      const completedDoc: UploadedDoc = {
        id: serverDoc.id,
        filename: serverDoc.filename ?? finalFilename,
        storageState: StorageState.WARM,
        mimeType: finalMimeType,
      };

      setOptimisticDocs(prev => prev.filter(d => d.id !== tempId));
      onUploadComplete?.(finalDoc);

    } catch (err: any) {
      console.error('[Uploader] Upload failed:', err);
      // Check for premium entitlement rejection
      if (err.response?.status === 403 && err.response?.data?.cta) {
        setDocs(prev => prev.map(d => d.id === tempId ? { 
          ...d, 
          storageState: 'PREMIUM_REQUIRED',
          cta: err.response.data.cta,
          message: err.response.data.message || 'Premium feature required.'
        } : d));
      } else {
        // Show generic error state
        setDocs(prev => prev.map(d => d.id === tempId ? { ...d, storageState: 'ERROR' } : d));
      }
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
              message={doc.message}
              cta={doc.cta}
              onRemove={doc.storageState !== 'INGESTING' ? () => removeDoc(doc.id) : undefined}
              onPreview={doc.storageState !== 'INGESTING' && doc.storageState !== 'ERROR' && doc.storageState !== 'PREMIUM_REQUIRED' ? () => handlePreview(doc.id, doc.filename) : undefined}
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
        accept=".pdf,.txt,.md,.csv,.json,image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/webm,video/quicktime,video/x-m4v,video/3gpp,audio/mp4,audio/mpeg,audio/wav,audio/x-m4a,audio/aac,audio/amr,audio/ogg,audio/flac,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.pages,.numbers,.key,.rtf,.vcf"
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
