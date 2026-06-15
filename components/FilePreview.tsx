'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { FileText, Image, FileCode, FileSpreadsheet, Loader2, AlertTriangle, X, Download, Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PreviewData {
  type: 'image' | 'text' | 'pdf' | 'json' | 'error';
  data: string;
  metadata?: Record<string, any>;
  error?: string;
}

export interface FilePreviewProps {
  /** File to preview (for upload preview) */
  file?: File;
  /** Pre-loaded preview data (for existing documents) */
  previewData?: PreviewData;
  /** Document ID for fetching preview from API */
  documentId?: string;
  /** Workspace ID for document context */
  workspaceId?: string;
  /** Custom API endpoint */
  apiEndpoint?: string;
  /** Called when preview is ready */
  onPreviewReady?: (preview: PreviewData) => void;
  /** Called when preview fails */
  onPreviewError?: (error: string) => void;
  /** Maximum height of preview area */
  maxHeight?: string;
  /** Show file info header */
  showHeader?: boolean;
  /** Allow download */
  allowDownload?: boolean;
  /** Allow fullscreen */
  allowFullscreen?: boolean;
  /** Custom className */
  className?: string;
}

interface PreviewState {
  data: PreviewData | null;
  loading: boolean;
  error: string | null;
  fullscreen: boolean;
}

export function FilePreview({
  file,
  previewData,
  documentId,
  workspaceId,
  apiEndpoint = '/api/files/preview',
  onPreviewReady,
  onPreviewError,
  maxHeight = '60vh',
  showHeader = true,
  allowDownload = true,
  allowFullscreen = true,
  className,
}: FilePreviewProps) {
  const [state, setState] = useState<PreviewState>({
    data: previewData || null,
    loading: !previewData && (!!file || !!documentId),
    error: null,
    fullscreen: false,
  });
  const abortControllerRef = useRef<AbortController | null>(null);
  const pdfWorkerLoaded = useRef(false);

  const loadPreview = useCallback(async () => {
    // If we already have preview data, use it
    if (previewData) {
      setState(s => ({ ...s, data: previewData, loading: false }));
      onPreviewReady?.(previewData);
      return;
    }

    // If we have a documentId, fetch from document preview API
    if (documentId) {
      await fetchDocumentPreview(documentId);
      return;
    }

    // If we have a file, upload to preview API
    if (file) {
      await generatePreview(file);
      return;
    }

    setState(s => ({ ...s, loading: false, error: 'No file or document ID provided' }));
    onPreviewError?.('No file or document ID provided');
  }, [file, documentId, workspaceId, previewData, apiEndpoint, onPreviewReady, onPreviewError]);

  const fetchDocumentPreview = async (docId: string) => {
    try {
      setState(s => ({ ...s, loading: true, error: null }));
      
      const params = new URLSearchParams();
      if (workspaceId) params.set('workspaceId', workspaceId);
      
      const response = await fetch(`/api/documents/${docId}/preview?${params}`);
      const data = await response.json();

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error('Document is currently being compressed. Please try again in a few moments.');
        }
        throw new Error(data.error || 'Failed to load preview');
      }

      // Convert document preview format to our preview format
      const preview: PreviewData = {
        type: data.contentRaw ? 'text' : 'error',
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

      setState(s => ({ ...s, data: preview, loading: false }));
      onPreviewReady?.(preview);
    } catch (err: any) {
      setState(s => ({ ...s, loading: false, error: err.message }));
      onPreviewError?.(err.message);
    }
  };

  const generatePreview = async (file: File) => {
    abortControllerRef.current = new AbortController();
    
    try {
      setState(s => ({ ...s, loading: true, error: null }));

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        body: formData,
        signal: abortControllerRef.current.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        // If file was rejected, show error but don't treat as preview failure
        if (response.status === 400 && data.reason) {
          throw new Error(data.reason);
        }
        throw new Error(data.error || 'Preview generation failed');
      }

      const preview: PreviewData = data.preview;
      
      // If PDF fallback, we'll handle it in the render
      if (preview.type === 'pdf' && preview.metadata?.fallback) {
        // Load pdf.js worker
        await loadPdfWorker();
      }

      setState(s => ({ ...s, data: preview, loading: false }));
      onPreviewReady?.(preview);
    } catch (err: any) {
      if (err.name === 'AbortError') return;
      setState(s => ({ ...s, loading: false, error: err.message }));
      onPreviewError?.(err.message);
    }
  };

  const loadPdfWorker = async () => {
    if (pdfWorkerLoaded.current) return;
    
    try {
      // Dynamically import pdfjs-dist to avoid SSR issues
      const pdfjsLib = await import('pdfjs-dist');
      const workerSrc = '/pdf.worker.min.mjs';
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
      pdfWorkerLoaded.current = true;
    } catch (err) {
      console.warn('[FilePreview] Failed to load pdf.js worker:', err);
    }
  };

  const handleRetry = () => {
    loadPreview();
  };

  const toggleFullscreen = () => {
    setState(s => ({ ...s, fullscreen: !s.fullscreen }));
  };

  const handleDownload = () => {
    if (file) {
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } else if (state.data?.type === 'image' && state.data.data.startsWith('data:')) {
      // For generated previews, use the data URL
      const a = document.createElement('a');
      a.href = state.data.data;
      a.download = (file as File | undefined)?.name || 'preview.png';
      a.click();
    }
  };

  // Load preview on mount or when file/documentId changes
  useEffect(() => {
    loadPreview();
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [loadPreview]);

  // If no file/documentId and no previewData, show nothing
  if (!file && !documentId && !previewData) {
    return null;
  }

  const { data, loading, error, fullscreen } = state;
  const previewType = data?.type || 'error';

  // Determine display component based on preview type
  const renderPreview = () => {
    if (!data) return null;

    switch (previewType) {
      case 'image':
        return (
          <div className="flex items-center justify-center min-h-[200px]">
            <img
              src={data.data}
              alt="Preview"
              className="max-w-full max-h-full object-contain rounded-md"
              style={{ maxHeight: fullscreen ? '90vh' : maxHeight }}
            />
          </div>
        );

      case 'pdf':
        return (
          <PdfPreview 
            dataUrl={data.data} 
            pageCount={data.metadata?.pageCount}
            maxHeight={fullscreen ? '90vh' : maxHeight}
          />
        );

      case 'text':
        return (
          <div className="font-mono text-sm whitespace-pre-wrap break-words max-h-[500px] overflow-y-auto p-4 bg-muted/30 rounded-md">
            {data.data}
            {data.metadata?.truncated && (
              <div className="mt-4 p-2 text-xs text-muted-foreground bg-yellow-500/10 border border-yellow-500/20 rounded">
                Truncated ({data.metadata.totalChars.toLocaleString()} total characters, {data.metadata.lines.toLocaleString()} lines)
              </div>
            )}
          </div>
        );

      case 'json':
        return (
          <div className="font-mono text-sm whitespace-pre-wrap break-words max-h-[500px] overflow-y-auto p-4 bg-muted/30 rounded-md">
            {typeof data.data === 'string' ? data.data : JSON.stringify(data.data, null, 2)}
          </div>
        );

      case 'error':
        return (
          <div className="flex flex-col items-center justify-center min-h-[200px] space-y-4 text-center p-4">
            <AlertTriangle className="h-12 w-12 text-amber-500" />
            <p className="text-amber-600 dark:text-amber-400 max-w-md">
              {data.error || 'Failed to generate preview'}
            </p>
            <button
              onClick={handleRetry}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
            >
              Retry
            </button>
          </div>
        );

      default:
        return (
          <div className="flex items-center justify-center min-h-[200px] text-muted-foreground">
            <FileText className="h-12 w-12" />
            <p>Preview not available for this file type</p>
          </div>
        );
    }
  };

  const renderHeader = () => {
    if (!showHeader) return null;

    const fileName = file?.name || data?.metadata?.filename || 'Document';
    const fileSize = file?.size || data?.metadata?.size;
    const mimeType = data?.metadata?.mimeType || file?.type;

    return (
      <div className={cn(
        'flex items-center justify-between p-3 border-b bg-muted/30 rounded-t-md',
        fullscreen && 'fixed top-0 left-0 right-0 z-50 border-b-2 border-primary'
      )}>
        <div className="flex items-center gap-3 min-w-0">
          <FileIcon mimeType={mimeType} className="h-8 w-8 text-muted-foreground flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-medium truncate">{fileName}</p>
            <p className="text-xs text-muted-foreground">
              {fileSize ? `${(fileSize / 1024).toFixed(1)} KB` : ''}
              {mimeType && fileSize ? ' • ' : ''}
              {mimeType || ''}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {allowDownload && (
            <button
              onClick={handleDownload}
              className="p-2 rounded-md hover:bg-muted transition-colors"
              title="Download"
            >
              <Download className="h-4 w-4" />
            </button>
          )}
          {allowFullscreen && (
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-md hover:bg-muted transition-colors"
              title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            >
              <Maximize2 className={cn("h-4 w-4", fullscreen && "rotate-45")} />
            </button>
          )}
          {fullscreen && (
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-md hover:bg-muted transition-colors"
              title="Close"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className={cn(
        'border rounded-xl overflow-hidden bg-card flex flex-col',
        fullscreen && 'fixed inset-0 z-50 rounded-none border-2 border-primary',
        className
      )}
      style={{ maxHeight: fullscreen ? '100vh' : maxHeight, width: fullscreen ? '100vw' : '100%' }}
    >
      {renderHeader()}
      <div className="flex-1 overflow-hidden" style={{ minHeight: 0 }}>
        {loading ? (
          <div className="flex items-center justify-center h-full min-h-[200px] space-x-3">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="text-muted-foreground">Generating preview...</span>
          </div>
        ) : (
          <div className="h-full overflow-auto p-4">
            {renderPreview()}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * PDF Preview Component using pdf.js
 */
function PdfPreview({ 
  dataUrl, 
  pageCount = 1, 
  maxHeight = '60vh' 
}: { 
  dataUrl: string; 
  pageCount?: number; 
  maxHeight?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadPdf = async () => {
      try {
        setLoading(true);
        const pdfjsLib = await import('pdfjs-dist');

        // Ensure worker is loaded
        if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
          pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        }

        // Load PDF from data URL - convert data URL to Uint8Array
        let pdfData: Uint8Array;
        if (dataUrl.startsWith('data:')) {
          const base64 = dataUrl.split(',')[1];
          const binary = atob(base64);
          pdfData = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) {
            pdfData[i] = binary.charCodeAt(i);
          }
        } else {
          // Assume it's a URL, fetch it
          const response = await fetch(dataUrl);
          const arrayBuffer = await response.arrayBuffer();
          pdfData = new Uint8Array(arrayBuffer);
        }

        const loadingTask = pdfjsLib.getDocument({ data: pdfData });
        const pdf = await loadingTask.promise;
        setPdfDoc(pdf);
        setError(null);
      } catch (err: any) {
        console.error('[PdfPreview] Error loading PDF:', err);
        setError(err.message || 'Failed to load PDF');
      } finally {
        setLoading(false);
      }
    };

    loadPdf();
  }, [dataUrl]);

  useEffect(() => {
    if (!pdfDoc || !canvasRef.current) return;

    const renderPage = async (pageNum: number) => {
      try {
        const page = await pdfDoc.getPage(pageNum);
        const canvas = canvasRef.current!;
        const context = canvas.getContext('2d')!;
        
        // Calculate scale to fit container
        const viewport = page.getViewport({ scale: 1 });
        const containerWidth = canvas.parentElement?.clientWidth || 800;
        const scale = Math.min(containerWidth / viewport.width, 2);
        
        const scaledViewport = page.getViewport({ scale });
        canvas.width = scaledViewport.width;
        canvas.height = scaledViewport.height;
        
        const renderContext = {
          canvasContext: context,
          viewport: scaledViewport,
        };
        
        await page.render(renderContext).promise;
      } catch (err) {
        console.error('[PdfPreview] Render error:', err);
      }
    };

    renderPage(currentPage);
  }, [pdfDoc, currentPage]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading PDF...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[300px] space-y-4 text-center p-4">
        <AlertTriangle className="h-12 w-12 text-amber-500" />
        <p className="text-amber-600 dark:text-amber-400">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center space-y-4" style={{ maxHeight, overflow: 'auto' }}>
      <div className="relative w-full max-w-2xl">
        <canvas ref={canvasRef} className="w-full h-auto shadow-lg rounded-md bg-white" />
      </div>
      {pageCount > 1 && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
            disabled={currentPage === 1}
            className="px-3 py-1 text-sm border rounded-md hover:bg-muted disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {pageCount}
          </span>
          <button
            onClick={() => setCurrentPage(p => Math.min(pageCount, p + 1))}
            disabled={currentPage === pageCount}
            className="px-3 py-1 text-sm border rounded-md hover:bg-muted disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * File icon component based on MIME type
 */
function FileIcon({ mimeType, className }: { mimeType?: string; className?: string }) {
  if (!mimeType) return <FileText className={className} />;
  
  if (mimeType.startsWith('image/')) return <Image className={className} />;
  if (mimeType === 'application/pdf') return <FileText className={className} />;
  if (mimeType.startsWith('text/') || 
      mimeType === 'application/json' ||
      mimeType === 'application/xml' ||
      mimeType === 'application/yaml') return <FileCode className={className} />;
  if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return <FileSpreadsheet className={className} />;
  
  return <FileText className={className} />;
}