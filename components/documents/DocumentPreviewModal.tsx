import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Loader2 } from 'lucide-react';
import { FilePreview, PreviewData } from '@/components/FilePreview';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string | null;
  filename: string;
  workspaceId?: string | null;
  mimeType?: string;
}

export function DocumentPreviewModal({
  isOpen,
  onOpenChange,
  documentId,
  filename,
  workspaceId,
  mimeType,
}: DocumentPreviewModalProps) {
  const [previewData, setPreviewData] = useState<PreviewData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cta, setCta] = useState<{ label: string; href: string } | null>(null);

  // Fetch preview when modal opens
  useEffect(() => {
    if (isOpen && documentId && documentId !== 'undefined' && documentId !== 'null') {
      // Initialize loading/error/cta state before fetching the preview.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(true);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCta(null);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPreviewData(null);

      const params = new URLSearchParams();
      if (workspaceId) params.set('workspaceId', workspaceId);

      fetch(`/api/documents/${documentId}/preview?${params}`)
        .then((res) => res.json())
        .then((data) => {
          if (!data.ok && data.error) {
            // Handle specific error cases
            if (data.status === 409 || data.error === 'Document is currently being compressed') {
              setError('Document is currently being compressed and indexed. Please try again in a few moments.');
            } else if (data.status === 403 && data.cta) {
              setError(data.message || 'Premium feature required.');
              setCta(data.cta);
            } else {
              setError(data.error || 'Failed to load document preview.');
            }
            setPreviewData({ type: 'error', data: '', error: data.error });
          } else {
            // Convert document preview format to FilePreview format
            const preview: PreviewData = {
              type: data.contentRaw ? (mimeType?.startsWith('image/') ? 'image' : 'text') : 'error',
              data: data.contentRaw || '',
              metadata: {
                mimeType: data.mimeType,
                storageState: data.storageState,
                hydrated: data.hydrated,
                pageCount: data.metadata?.pageCount,
              },
            };
            if (!data.contentRaw) {
              preview.type = 'error';
              preview.error = 'No text content available';
            }
            setPreviewData(preview);
          }
          setLoading(false);
        })
        .catch((err) => {
          console.error('[DocumentPreviewModal] Fetch error:', err);
          setError('Failed to load document preview.');
          setPreviewData({ type: 'error', data: '', error: 'Network error' });
          setLoading(false);
        });
    } else if (!isOpen) {
      // Reset state when closed
      setPreviewData(null);
      setError(null);
      setCta(null);
    }
  }, [isOpen, documentId, workspaceId, mimeType]);

  if (!isOpen && !loading && !previewData) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{filename}</DialogTitle>
          <DialogDescription className="sr-only">Document preview</DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-hidden min-h-0">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading preview...</p>
            </div>
          ) : previewData ? (
            <FilePreview
              previewData={previewData}
              showHeader={false}
              allowDownload={false}
              allowFullscreen={true}
              maxHeight="100%"
              className="h-full"
            />
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full min-h-[300px] space-y-4">
              <p className="text-sm text-amber-600 dark:text-amber-400 text-center px-4 max-w-md">{error}</p>
              {cta && (
                <a
                  href={cta.href}
                  className="inline-flex h-9 items-center justify-center rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-violet-600/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                  {cta.label}
                </a>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center h-full min-h-[300px]">
              <p className="text-sm text-muted-foreground">No preview available</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}