'use client';

import React, { useState, useRef, useCallback } from 'react';
import { Shield, Database, Terminal, CheckCircle2, Loader2, PanelRightClose, PanelRightOpen, Activity } from 'lucide-react';
import { useConversationStream, ConversationMessage } from '@/hooks/useConversationStream';

interface SMEWorkspaceProps {
  consultant: {
    id: string;
    title: string;
    domain: string;
    mode: string;
  };
}

const PROPRIETARY_BASE = [
  'Global Textile Sourcing',
  'Hardware & Zippers',
  'Heavy-weight Cut & Sew',
];

export const SMEWorkspace: React.FC<SMEWorkspaceProps> = ({ consultant }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [message, setMessage] = useState('');
  const [showTrajectory, setShowTrajectory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const {
    messages,
    sendMessage,
    isProcessing,
    ingestionStatus,
    activeSources,
    trajectory,
  } = useConversationStream({
    consultantId: consultant.id,
    onIngestionStatusChange: (status) => {
      // TODO: Replace with real workspace API polling/SSE
      // (see app/api/conversation/route.ts for the SSE entrypoint)
    },
  });

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const handleSend = async () => {
    const text = message.trim();
    if (!text || isProcessing) return;
    setShowTrajectory(false);
    setMessage('');
    await sendMessage(text);
    // Scroll after React flushes the new messages
    setTimeout(scrollToBottom, 0);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const renderMessage = (msg: ConversationMessage) => {
    const isUser = msg.role === 'user';
    return (
      <div key={msg.id} className={`flex gap-4 max-w-4xl mx-auto w-full ${isUser ? 'flex-row-reverse' : ''}`}>
        <div
          className={`w-8 h-8 rounded-full border flex items-center justify-center shrink-0 ${
            isUser
              ? 'bg-zinc-800 border-zinc-700'
              : 'bg-zinc-900 border-zinc-800'
          }`}
        >
          <Terminal className={`w-4 h-4 ${isUser ? 'text-zinc-300' : 'text-white'}`} />
        </div>
        <div className={`flex-1 space-y-2 pt-1 ${isUser ? 'text-right' : ''}`}>
          <p className={`text-sm leading-relaxed ${isUser ? 'text-zinc-200' : 'text-zinc-300'}`}>
            {msg.content}
            {msg.isStreaming && <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-emerald-500 animate-pulse" />}
          </p>
        </div>
      </div>
    );
  };

  const renderKnowledgeSubstrate = () => (
    <>
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

        {/* Additional injected sources */}
        {activeSources.length > 0 && (
          <div className="space-y-2">
            {activeSources.map((source: any, idx: number) => (
              <div
                key={idx}
                className="flex items-center gap-2 p-2 rounded-lg bg-zinc-900/50 border border-zinc-800/50"
              >
                <Database className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
                <span className="text-xs text-zinc-300 truncate">
                  {typeof source === 'string' ? source : source?.title || `Source ${idx + 1}`}
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="text-xs text-zinc-600 italic">
          +{activeSources.length} more injected sources
        </div>
      </div>
    </>
  );

  return (
    <div className="flex h-screen w-full bg-[#050505] text-zinc-300 font-sans overflow-hidden">

      {/* Main Interaction Surface */}
      <div className="flex-1 flex flex-col relative min-w-0">

        {/* Identity Header */}
        <header className="h-14 sm:h-16 border-b border-zinc-900/80 bg-[#0a0a0a] flex items-center justify-between px-3 sm:px-6 shrink-0">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold text-white tracking-tight truncate">{consultant.title}</h1>
                <span className="hidden sm:inline px-2 py-0.5 rounded-full bg-zinc-900 border border-zinc-800 text-[10px] uppercase font-mono text-zinc-400">
                  {consultant.mode}
                </span>
              </div>
              <span className="text-xs text-zinc-500 truncate max-w-[200px] sm:max-w-[240px]">{consultant.domain}</span>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-zinc-500">
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
          {messages.length === 0 && (
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
          )}

          {/* Message Feed */}
          {messages.map(renderMessage)}

          {/* Reasoning / Trajectory Toggle Panel */}
          {showTrajectory && trajectory.length > 0 && (
            <div className="max-w-4xl mx-auto w-full rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Activity className="w-3.5 h-3.5 text-amber-500" />
                <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                  Agent Trajectory ({trajectory.length} steps)
                </span>
              </div>
              <div className="space-y-2 max-h-64 overflow-y-auto scrollbar-thin">
                {trajectory.map((step: any, idx: number) => (
                  <div key={idx} className="text-xs text-zinc-400 border-l border-zinc-800 pl-3 py-1">
                    <span className="text-zinc-500 font-mono mr-2">{String(idx + 1).padStart(2, '0')}</span>
                    {typeof step === 'string' ? step : JSON.stringify(step)}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-3 sm:p-4 bg-gradient-to-t from-[#050505] to-transparent shrink-0">
          <div className="max-w-4xl mx-auto">
            <div className="relative flex items-end gap-2 bg-[#0a0a0a] border border-zinc-800 rounded-xl p-2 transition-colors">
              <textarea
                ref={inputRef}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Define your parameters..."
                rows={1}
                className="flex-1 min-h-[44px] max-h-32 bg-transparent border-0 focus:outline-none resize-none text-sm text-white placeholder-zinc-600 py-3 px-2"
              />

              {/* Trajectory toggle — desktop only */}
              {trajectory.length > 0 && (
                <button
                  onClick={() => setShowTrajectory((v) => !v)}
                  className="hidden sm:block shrink-0 px-2 py-1.5 text-[10px] font-mono uppercase tracking-wider border rounded-lg transition-colors text-zinc-400 border-zinc-700 hover:border-zinc-500 hover:text-zinc-200"
                >
                  {showTrajectory ? 'Hide' : 'Reasoning'}
                </button>
              )}

              {/* Send button — always visible */}
              <button
                onClick={handleSend}
                disabled={!message.trim() || isProcessing}
                className="p-2 bg-white text-black rounded-lg hover:bg-zinc-200 transition-colors disabled:opacity-40 shrink-0"
              >
                <Terminal className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* The Knowledge Substrate — desktop sidebar / mobile bottom sheet */}
      {isSidebarOpen && (
        <>
          {/* Desktop sidebar */}
          <aside className="hidden md:flex w-80 border-l border-zinc-900/80 bg-[#0a0a0a] shrink-0 flex-col overflow-hidden">
            <div className="p-4 border-b border-zinc-900/80 shrink-0">
              <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-500 mb-1">Knowledge Substrate</h2>
              <p className="text-xs text-zinc-400">Active data pipelines & context</p>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
              {renderKnowledgeSubstrate()}
            </div>
          </aside>

          {/* Mobile bottom sheet */}
          <div className="md:hidden fixed inset-0 z-40">
            <div className="absolute inset-0 bg-black/60" onClick={() => setIsSidebarOpen(false)} />
            <div className="absolute bottom-0 left-0 right-0 max-h-[70vh] rounded-t-2xl bg-[#0a0a0a] border-t border-zinc-900/80 shadow-xl flex flex-col">
              <div className="flex items-center justify-between p-4 border-b border-zinc-900/80 shrink-0">
                <h2 className="text-sm font-semibold text-white">Knowledge Substrate</h2>
                <button
                  onClick={() => setIsSidebarOpen(false)}
                  className="p-2 hover:bg-zinc-900 rounded-lg text-zinc-400"
                >
                  <PanelRightClose className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-4 space-y-6 scrollbar-thin">
                {renderKnowledgeSubstrate()}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
