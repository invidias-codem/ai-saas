"use client";

import React, { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { X } from 'lucide-react';
import { RemoteConfig } from '../../types/electron';

interface RemoteHandoffProps {
  onClose: () => void;
}

export function RemoteHandoff({ onClose }: RemoteHandoffProps) {
  const [config, setConfig] = useState<RemoteConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchConfig() {
      if (typeof window !== 'undefined' && window.electron) {
        try {
          const remoteConfig = await window.electron.getRemoteConfig();
          setConfig(remoteConfig);
        } catch (err) {
          console.error("Failed to fetch remote config from Electron:", err);
          setError("Failed to fetch connection details. Ensure Lattice Core is running in desktop mode.");
        }
      } else {
        setError("Desktop integration not available in web mode.");
      }
    }

    fetchConfig();
  }, []);

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm transition-opacity duration-300"
      onClick={handleBackdropClick}
    >
      <div className="relative w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl p-8 transform transition-all scale-100 opacity-100">
        
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full bg-zinc-800/50 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors"
          aria-label="Close"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex flex-col items-center text-center space-y-6">
          
          <div className="space-y-2">
            <h2 className="text-2xl font-bold text-white tracking-tight">Monitor on Phone</h2>
            <p className="text-sm text-zinc-400 max-w-[280px] leading-relaxed">
              Open the Lattice app and scan to monitor this task on the go.
            </p>
          </div>

          <div className="bg-white p-4 rounded-xl shadow-inner">
            {error ? (
              <div className="w-64 h-64 flex flex-col items-center justify-center text-red-500 text-sm text-center border-2 border-dashed border-red-200 rounded-lg">
                <span className="font-medium">Connection Error</span>
                <span className="text-red-400 mt-2 px-4">{error}</span>
              </div>
            ) : !config ? (
              <div className="w-64 h-64 flex items-center justify-center border-2 border-dashed border-zinc-200 rounded-lg animate-pulse">
                <span className="text-zinc-400 text-sm font-medium">Generating secure token...</span>
              </div>
            ) : (
              <QRCodeSVG
                value={JSON.stringify(config)}
                size={256}
                level="H"
                includeMargin={false}
                className="w-64 h-64"
                fgColor="#000000"
                bgColor="#FFFFFF"
              />
            )}
          </div>

          {config && (
            <div className="flex items-center space-x-2 text-xs font-medium text-zinc-500 bg-zinc-800/50 px-4 py-2 rounded-full border border-zinc-800">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span>Secure Gateway Active ({config.ip}:{config.port})</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
