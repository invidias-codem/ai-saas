import React, { useEffect, useState } from 'react';
import axios from 'axios';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { StorageState } from '@/lib/types/documents';
import { Loader2 } from 'lucide-react';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  documentId: string | null;
  filename: string;
}

interface PreviewData {
  contentRaw?: string;
  storageState: StorageState;
  hydrated?: boolean;
}

export function DocumentPreviewModal({
  isOpen,
  onOpenChange,
  documentId,
  filename,
}: DocumentPreviewModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PreviewData | null>(null);

  useEffect(() => {
    if (isOpen && documentId) {
      setLoading(true);
      setError(null);
      setData(null);

      // Workspace ID is optional now, the route handles it. We can omit it.
      axios
        .get(`/api/documents/${documentId}/preview`)
        .then((res) => {
          setData(res.data);
          setLoading(false);
        })
        .catch((err) => {
          if (err.response?.status === 409) {
            setError('Document is currently being compressed and indexed. Please try again in a few moments.');
          } else {
            setError('Failed to load document preview.');
          }
          setLoading(false);
        });
    }
  }, [isOpen, documentId]);

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{filename}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto mt-4 rounded-md border bg-muted/30 p-4 relative">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-48 space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading preview...</p>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-48">
              <p className="text-sm text-amber-600 dark:text-amber-400 text-center px-4">{error}</p>
            </div>
          ) : data?.contentRaw ? (
            <div className="text-sm whitespace-pre-wrap font-mono text-muted-foreground break-words">
              {data.contentRaw}
            </div>
          ) : (
            <div className="flex items-center justify-center h-48">
              <p className="text-sm text-muted-foreground">No text content available.</p>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
