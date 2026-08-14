'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Shield, Database, Terminal, CheckCircle2, Loader2, PanelRightClose, PanelRightOpen } from 'lucide-react';

interface SMEWorkspaceProps {
  consultant: {
    id: string;
    title: string;
    domain: string;
    mode: string;
  };
}

type IngestionStatus = 'processing' | 'complete' | 'error';

// Mock proprietary base pipelines — replace with real fetch from the workspace API
const PROPRIETARY_BASE = [
  'Global Textile Sourcing',
  'Hardware & Zippers',
  'Heavy-weight Cut & Sew',
];

export const SMEWorkspace: React.FC<SMEWorkspaceProps> = ({ consultant }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [ingestionStatus, setIngestionStatus] = useState<IngestionStatus>('processing');
  const [message, setMessage] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // TODO: Wire ingestionStatus to workspace API polling/SSE
  // (see app/api/conversation/route.ts for the SSE entrypoint)

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  return (
    <div className="flex h-screen w-full bg-[#050505] text-zinc-300 font-sans overflow-hidden">

      {/* Main Interaction Surface */}
      <div className="flex-1 flex flex-col relative min-w-0">

        {/* The Identity Header */}
        <header className="h-16 border-b border-zinc-900/80 bg-[#0a0a0a] flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold text-white tracking-tight">{consultant.title}</h1>
                <span className="px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[10px] uppercase font-mono text-zinc-400">
                  {consultant.mode}
                </span>
              </div>
              <span className="text-xs text-zinc-500 truncate max-w-[240px]">{consultant.domain}</span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-500">
              <Shield className="w-3.5 h-3.5 text-emerald-500" />
              <span>Sandbox Secure</span>
            </div>
            <button
              onClick={() => setIsSidebarOpen((v) => !v)}
              className="p-2 hover:bg-zinc-900 rounded-lg transition-colors text-zinc-400"
              aria-label={isSidebarOpen ? 'Close knowledge panel' : 'Open knowledge panel'}
            >
              {isSidebarOpen ? <PanelRightClose className="w-4 h-4" /> : <PanelRightOpen className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* Chat / Execution Feed */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 scrollbar-thin">
          {/* Initial Greeting */}
          <div className="flex gap-4 max-w-4xl mx-auto w-full">
            <div className="w-8 h-8 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
              <Terminal className="w-4 h-4 text-white" />
            </div>
            <div className="flex-1 space-y-2 pt-1">
              <p className="text-sm text-zinc-300 leading-relaxed">
                Initialization complete.
                <br />
                I have loaded the proprietary data pipelines for{' '}
                <span className="text-white font-medium">technical apparel manufacturing</span> and{' '}
                <span className="text-white font-medium">high-density print specifications</span>.
              </p>
              <p className="text-sm text-zinc-400 leading-relaxed">
                I am currently processing the custom tech packs and loopwheel cotton specs you provided. While that completes, how would you like to structure the initial dimensional puff-print graphics?
              </p>
            </div>
          </div>
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-gradient-to-t from-[#050505] to-transparent shrink-0">
          <div className="max-w-4xl mx-auto relative">
            <textarea
              ref={inputRef}
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  // TODO: wire to /api/conversation SSE stream
                }
              }}
              placeholder="Define your parameters..."
              className="w-full bg-[#0a0a0a] border border-zinc-800 rounded-xl py-4 pl-4 pr-12 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600 resize-none h-14 transition-colors"
            />
            <button
              className="absolute right-3 top-3.5 p-1.5 bg-white text-black rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-40"
              disabled={!message.trim()}
            >
              <Terminal className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* The Knowledge Substrate (Right Sidebar) */}
      {isSidebarOpen && (
        <aside className="w-80 border-l border-zinc-900/80 bg-[#0a0a0a] shrink-0 flex flex-col overflow-hidden">
          <div className="p-4 border-b border-zinc-900/80 shrink-0">
            <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-500 mb-1">Knowledge Substrate</h2>
            <p className="text-xs text-zinc-400">Active data pipelines &amp; context</p>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">

            {/* Core Forgery Pipelines */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider">Proprietary Base</h3>
              <div className="space-y-2">
                {PROPRIETARY_BASE.map((source) => (
                  <div
                    key={source}
                    className="flex items-center gap-2 p-2 rounded-lg bg-zinc-900/50 border border-zinc-800/50"
                  >
                    <Database className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                    <span className="text-xs text-zinc-300 truncate">{source}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* User Injected Sources (Optimistic UI) */}
            <div className="space-y-3">
              <h3 className="text-xs font-semibold text-white uppercase tracking-wider">Session Injections</h3>
              <div
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  ingestionStatus === 'complete'
                    ? 'bg-zinc-900 border-emerald-900/40'
                    : ingestionStatus === 'error'
                    ? 'bg-zinc-900 border-red-900/40'
                    : 'bg-zinc-900 border-zinc-800'
                }`}
              >
                <div className="flex items-center gap-3">
                  {ingestionStatus === 'processing' ? (
                    <Loader2 className="w-4 h-4 text-zinc-400 animate-spin shrink-0" />
                  ) : ingestionStatus === 'complete' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  ) : (
                    <Database className="w-4 h-4 text-red-400 shrink-0" />
                  )}
                  <div className="flex flex-col min-w-0">
                    <span className="text-xs text-white truncate">Custom Brand Deck</span>
                    <span className="text-[10px] text-zinc-500">
                      {ingestionStatus === 'processing'
                        ? 'Vectorizing…'
                        : ingestionStatus === 'complete'
                        ? 'Indexed'
                        : 'Ingestion failed — retrying'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Placeholder for additional injected sources */}
              <div className="text-xs text-zinc-600 italic">
                +{0} more injected sources
              </div>
            </div>

          </div>
        </aside>
      )}
    </div>
  );
};
