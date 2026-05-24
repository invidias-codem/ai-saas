import React from 'react';
import { StorageState } from '@/lib/types/documents';
import { FileText, Loader2, Database, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FileItemProps {
  id: string;
  filename: string;
  storageState: StorageState | 'INGESTING' | 'ERROR';
  onPreview?: () => void;
  onRemove?: () => void;
}

export function FileItem({ id, filename, storageState, onPreview, onRemove }: FileItemProps) {
  return (
    <div className="flex items-center justify-between p-3 mb-2 rounded-xl border bg-card/50 shadow-sm backdrop-blur-sm transition-all hover:bg-card">
      <div className="flex items-center gap-3 overflow-hidden cursor-pointer" onClick={onPreview}>
        <div className={cn(
          "h-10 w-10 flex-shrink-0 rounded-lg flex items-center justify-center text-white",
          storageState === 'WARM' && "bg-gradient-to-br from-emerald-400 to-emerald-600",
          storageState === 'COMPRESSING' && "bg-gradient-to-br from-amber-400 to-amber-600 animate-pulse",
          storageState === 'COLD' && "bg-gradient-to-br from-slate-400 to-slate-600",
          storageState === 'INGESTING' && "bg-gradient-to-br from-indigo-400 to-indigo-600 animate-pulse",
          storageState === 'ERROR' && "bg-gradient-to-br from-red-400 to-red-600",
        )}>
          {storageState === 'WARM' && <Zap className="h-5 w-5" />}
          {storageState === 'COMPRESSING' && <Loader2 className="h-5 w-5 animate-spin" />}
          {storageState === 'COLD' && <Database className="h-5 w-5" />}
          {storageState === 'INGESTING' && <Loader2 className="h-5 w-5 animate-spin" />}
          {storageState === 'ERROR' && <span className="text-lg font-bold">!</span>}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">{filename}</p>
          <div className="flex items-center gap-1.5 mt-0.5">
             <StatusBadge state={storageState} />
          </div>
        </div>
      </div>
      {onRemove && (
        <button 
          onClick={(e) => { e.stopPropagation(); onRemove(); }}
          className="text-muted-foreground hover:text-destructive p-2 rounded-full hover:bg-destructive/10 transition-colors"
        >
          <svg width="15" height="15" viewBox="0 0 15 15" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M11.7816 4.03157C12.0062 3.80702 12.0062 3.44295 11.7816 3.2184C11.5571 2.99385 11.193 2.99385 10.9685 3.2184L7.50005 6.68682L4.03164 3.2184C3.80708 2.99385 3.44301 2.99385 3.21846 3.2184C2.99391 3.44295 2.99391 3.80702 3.21846 4.03157L6.68688 7.49999L3.21846 10.9684C2.99391 11.193 2.99391 11.5571 3.21846 11.7816C3.44301 12.0061 3.80708 12.0061 4.03164 11.7816L7.50005 8.31316L10.9685 11.7816C11.193 12.0061 11.5571 12.0061 11.7816 11.7816C12.0062 11.5571 12.0062 11.193 11.7816 10.9684L8.31322 7.49999L11.7816 4.03157Z" fill="currentColor" fillRule="evenodd" clipRule="evenodd"></path>
          </svg>
        </button>
      )}
    </div>
  );
}

function StatusBadge({ state }: { state: StorageState | 'INGESTING' | 'ERROR' }) {
  if (state === 'INGESTING') {
    return <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-500 bg-indigo-500/10 px-2 py-0.5 rounded-full">Uploading & Indexing...</span>;
  }
  if (state === 'ERROR') {
    return <span className="text-[10px] uppercase font-bold tracking-wider text-red-500 bg-red-500/10 px-2 py-0.5 rounded-full">Upload Failed</span>;
  }
  if (state === 'WARM') {
    return <span className="text-[10px] uppercase font-bold tracking-wider text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full">Warm Storage</span>;
  }
  if (state === 'COMPRESSING') {
    return <span className="text-[10px] uppercase font-bold tracking-wider text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-full flex items-center gap-1">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-ping" />
      Compressing...
    </span>;
  }
  return <span className="text-[10px] uppercase font-bold tracking-wider text-slate-500 bg-slate-500/10 px-2 py-0.5 rounded-full">Cold Archive</span>;
}
