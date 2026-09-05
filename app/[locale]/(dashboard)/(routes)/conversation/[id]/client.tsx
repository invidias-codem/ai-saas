"use client";

import React, { useState, useEffect, useSyncExternalStore } from "react";
import { useTranslations } from "next-intl";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

import { KoFiNudge } from "@/components/kofi-nudge";
import { FileGateNudge } from "@/components/file-gate-nudge";
import { useSupportNudge } from "@/hooks/use-support-nudge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { AlertCircle, X, Plus, Code, Sparkles, Layers3, Cpu, Search, Zap, FileText, Brain } from "lucide-react";
import { BrandIcon } from "@/lib/icons/brandIcons";
import { ShareIconButton } from "@/components/share-button";
import { cn } from "@/lib/utils";
import { ChatBubbleIcon, PersonIcon } from "@radix-ui/react-icons";
import { submitFeedback } from "@/lib/feedback/submitFeedback";
import { UploadedDoc } from "@/components/documents/NeuralArchivalUploader";
import { ContextualNudge } from "@/components/workspaces/ContextualNudge";
import { SyncStatusIndicator } from "@/components/harness/SyncStatusIndicator";
import { useWorkspaceSyncStatus } from "@/hooks/useWorkspaceSyncStatus";
import { useChatScroll } from "@/components/chat/useChatScroll";
import { ScrollToBottom } from "@/components/chat/ScrollToBottom";
import { useFileUpload } from "@/components/chat/useFileUpload";
import { useSessionSync } from "@/components/chat/useSessionSync";
import { useMemoryInsights } from "@/components/chat/useMemoryInsights";
import { MemoryInsights } from "@/components/chat/MemoryInsights";
import { useChatStream } from "@/components/chat/useChatStream";
import { Composer } from "@/components/chat/Composer";
import { RuntimeStatusBar } from "@/components/chat/RuntimeStatusBar";
import { InlineMediaCard } from "@/components/chat/InlineMediaCard";
import { MediaApprovalCard } from "@/components/chat/MediaApprovalCard";
import type { MediaEnvelope, ApprovalEnvelope, ModelSwitchEvent } from "@/lib/media/envelope";
import { clearSessionMemoryStorage } from "@/lib/sessionClientMemory";
import { useSessionCleanup } from "@/lib/useSessionCleanup";
import { createNewConversation } from "@/lib/conversationManager";
import { useSupabaseChat } from "@/app/hooks/useSupabaseChat";
import { useRuntimeStore } from "@/lib/store/runtimeStore";
import { usePricingModal } from "@/lib/store/pricing-modal-store";

// New Agentic Integration
import { ModelProvider, useModel } from "@/contexts/ModelContext";
import { ModelToggle } from "@/components/chat/ModelToggle";
import { SourceDisplay, Source } from "@/components/chat/SourceDisplay";
import { ArtifactCard } from "@/components/chat/ArtifactCard";
import { parseArtifacts } from "@/lib/llm/artifacts";

// Upload compression: client-side lz-string for large base64 payloads, transparent to the API schema.
// Decompression happens on the server for /api/analyze-upload; chat remains uncompressed to preserve streaming behavior.

// Message structure
interface Message {
  text: string;
  role: "user" | "bot";
  timestamp: Date;
  sources?: Source[];
  media?: MediaEnvelope[];
  approvalRequest?: ApprovalEnvelope;
  modelSwitch?: ModelSwitchEvent;
}

interface ConversationContext {
  workspaceId: string | null;
  workspaceName: string | null;
  operatingProfileId: string | null;
  operatingProfileName: string | null;
  operatingProfileMode: string | null;
}

// Safe Chart Component
interface ChartDataPoint {
  name: string;
  value: number;
  [key: string]: any;
}

const SafeChart = ({ data }: { data: ChartDataPoint[] }) => {
    const isMounted = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false
    );

    if (!isMounted) return null;

  return (
    <div className="my-6 w-full overflow-hidden rounded-lg border bg-card p-4 shadow-sm">
      <div className="overflow-x-auto w-full" style={{ minHeight: '300px' }}>
        <ResponsiveContainer width="100%" height={300} minWidth={300}>
          {data.length <= 5 ? (
            <PieChart>
              <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} fill="#8884d8" label>
                {data.map((_entry, index: number) => <Cell key={`cell-${index}`} fill={['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'][index % 5]} />)}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
              <Legend wrapperStyle={{ fontSize: '12px', paddingTop: '10px' }} />
            </PieChart>
          ) : (
            <BarChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
              <XAxis dataKey="name" angle={-30} textAnchor="end" height={60} interval={0} fontSize={10} tickLine={false} axisLine={false} />
              <YAxis fontSize={10} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="value" fill="#6366f1" radius={[4, 4, 0, 0]} />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );
};

// Chart rendering component
const RenderTableAsChart = ({ node, ...props }: any) => {
  let chartData: { name: string; value: number }[] | null = null;
  try {
    const table = node;
    const headers = table.children?.[0]?.children?.map((th: any) => th.children?.[0]?.value) || [];
    const rows = table.children?.slice(1)?.map((tr: any) =>
      tr.children?.map((td: any) => td.children?.[0]?.value)
    ) || [];

    if (headers.length === 2 && rows.length > 0 && !isNaN(parseFloat(rows[0][1]))) {
      chartData = rows.map((row: any) => ({ name: row[0], value: parseFloat(row[1]) }));
    }
  } catch (e) {
    console.error("Error parsing/rendering chart:", e);
  }

  if (chartData) {
    return <SafeChart data={chartData} />;
  }

  return (
    <div className="my-4 w-full overflow-x-auto">
      <table className="w-full" {...props}>
        {props.children}
      </table>
    </div>
  );
};

function modeLabel(mode?: string | null) {
  switch (mode) {
    case 'research': return 'Research Analyst';
    case 'agentic': return 'Agentic Operator';
    case 'drafting': return 'Drafting Partner';
    case 'memory_native': return 'Memory-Native Assistant';
    case 'copilot': return 'Fast Copilot';
    default: return 'Custom Profile';
  }
}

// Module-scope icon component — avoids creating a component alias during render
// (react-hooks/static-components).
function ProfileModeIcon({ mode, className }: { mode?: string | null; className?: string }) {
  switch (mode) {
    case 'research': return <Search className={className} />;
    case 'agentic': return <Zap className={className} />;
    case 'drafting': return <FileText className={className} />;
    case 'memory_native': return <Brain className={className} />;
    case 'copilot': return <Cpu className={className} />;
    default: return <Cpu className={className} />;
  }
}

// Module-scope typing indicator (react-hooks/static-components).
function TypingIndicator({ agentMode }: { agentMode: string | undefined }) {
  if (agentMode === 'agentic') {
    return (
      <div className="flex items-center space-x-3 mb-6 animate-in fade-in duration-300">
        <Avatar className="h-8 w-8 ring-1 ring-border/50">
          <AvatarImage src="/lattice-logo.png" alt="Weaver avatar" />
          <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-xs">AI</AvatarFallback>
        </Avatar>
        <div className="flex items-center space-x-2 text-indigo-500 text-sm font-medium animate-pulse">
          <Sparkles className="w-4 h-4" />
          <span>Thinking & Executing Code...</span>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center space-x-3 mb-6 animate-in fade-in duration-300">
      <Avatar className="h-8 w-8 ring-1 ring-border/50">
        <AvatarImage src="/lattice-logo.png" alt="Weaver avatar" />
        <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-xs">AI</AvatarFallback>
      </Avatar>
      <div className="flex items-center space-x-1.5 h-8">
        <div className="h-2 w-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
        <div className="h-2 w-2 bg-purple-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
        <div className="h-2 w-2 bg-sky-400 rounded-full animate-bounce"></div>
      </div>
    </div>
  );
}

function ConversationPageGlobalWrapper({
  conversationId,
  initialMessages = [],
  conversationContext,
  initialConsultantGreeting,
}: {
  conversationId: string;
  initialMessages?: any[];
  conversationContext: ConversationContext;
  initialConsultantGreeting?: string | null;
}) {
  return (
    <ModelProvider>
      <ConversationPage
        conversationId={conversationId}
        initialMessages={initialMessages}
        conversationContext={conversationContext}
        initialConsultantGreeting={initialConsultantGreeting}
      />
    </ModelProvider>
  )
}

// Internal Page Component
function ConversationPage({
  conversationId,
  initialMessages,
  conversationContext,
  initialConsultantGreeting,
}: {
  conversationId: string;
  initialMessages: any[];
  conversationContext: ConversationContext;
  initialConsultantGreeting?: string | null;
}) {
  const t = useTranslations("Conversation");

  const convertedInitialMessages = React.useMemo(() => initialMessages.map(msg => ({
    id: msg.id,
    role: msg.role,
    text: msg.text,
    timestamp: new Date(msg.timestamp),
    sources: msg.sources
  })), [initialMessages]);
  const { messages: supabaseMessages } = useSupabaseChat(conversationId, convertedInitialMessages);
  const { agentMode } = useModel(); // Use Agentic Mode Context
  const [messages, setMessages] = useState<Message[]>(() => 
    initialMessages.map(msg => ({
      ...msg,
      timestamp: new Date(msg.timestamp)
    }))
  );

  // Nudge Integration
  const { showNudge, trackActivity, dismissNudge } = useSupportNudge();

  const [error, setError] = useState<string | null>(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showContextSheet, setShowContextSheet] = useState(false);
  const [showGreeting, setShowGreeting] = useState<boolean>(() => Boolean(initialConsultantGreeting));
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [showFileGateNudge, setShowFileGateNudge] = useState(false);
  const { open: openPricingModal } = usePricingModal();

  // Sync Supabase messages to local state with deduplication.
  // Genuine external-state synchronization (external store → local state).
  useEffect(() => {
    if (supabaseMessages && supabaseMessages.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMessages(prev => {
        // Merge: keep optimistic user messages not yet in Supabase
        const supabaseTimestamps = new Set(supabaseMessages.map(m => m.timestamp.getTime()));
        const pendingOptimistic = prev.filter(
          m => m.role === 'user' && !supabaseTimestamps.has(m.timestamp.getTime())
        );
        return [...supabaseMessages, ...pendingOptimistic];
      });
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setShowGreeting(false);
    }
  }, [supabaseMessages]);

  // File attachment lifecycle (T2): upload state transitions + GCS/base64 logic.
  const {
    selectedFile,
    showFilePreview,
    fileInputRef,
    handleAttachClick,
    handleFileChange,
    togglePreview,
    removeFile,
    clearFile,
    buildFilePayload,
  } = useFileUpload(setError);
  const [userId, setUserId] = useState("");
  const [debugExecutionMode, setDebugExecutionMode] = useState<string | undefined>(undefined);
  const [debugIntent, setDebugIntent] = useState<string | undefined>(undefined);

  // Workspace sync status (only when workspaceId is available)
  const syncStatus = useWorkspaceSyncStatus(
    conversationContext.workspaceId || ""
  );

  // Memory insights (T5): episodic suggestion + memory count + pulse
  const {
    memoryCount,
    isMemoryPulsing,
    swarmSuggestion,
  } = useMemoryInsights({
    workspaceId: conversationContext.workspaceId,
    messageCount: messages.length,
    initialMessageCount: initialMessages.length,
  });

  // GitHub OAuth connect (redirects to /api/integrations/github/auth)
  const handleGitHubConnect = () => {
    window.location.href = "/api/integrations/github/auth"; // Trigger OAuth
  };

  // Refs
  useSessionCleanup();

  // Chat scroll management (T1): refs, manual scroll-to-bottom, and
  // "scrolled up" detection that drives the floating ScrollToBottom button.
  const {
    bottomRef,
    chatContainerRef,
    scrollToBottom,
    showScrollButton,
  } = useChatScroll(messages.length);

  const GREETING_MESSAGE = "Hi there! How can I assist you today? Feel free to ask me anything or attach a file for insights.";

  // No auto-scroll - let users scroll manually to read responses from the beginning

  // --- Session & Sync (T3): session/device id, memory restore/persist, cloud sync ---
  const {
    sessionId,
    deviceId,
    multiDeviceStatus,
    sessionRestored,
  } = useSessionSync({
    conversationId,
    userId,
    messages,
    onRestoreMessages: setMessages,
    onSetUserId: setUserId,
    onHideGreeting: () => setShowGreeting(false),
  });

  // --- Core streaming pipeline (T6): input + submit + stream parsing ---
  const {
    userInput,
    setUserInput,
    loading,
    streaming,
    streamingContent,
    handleInputChange,
    handleSendMessage,
    handleKeyPress,
  } = useChatStream({
    conversationId,
    userId,
    agentMode,
    messages,
    setMessages,
    selectedFile,
    buildFilePayload,
    clearFile,
    uploadedDocs,
    setError,
    setShowGreeting,
    setDebugExecutionMode,
    setDebugIntent,
    setShowFileGateNudge,
    openPricingModal,
    trackActivity,
  });

  // ─── Sync local runtime state to global store for dashboard shell ──────────
  useEffect(() => {
    const store = useRuntimeStore.getState();
    store.setRuntime({
      agentMode,
      loading,
      streaming,
      error,
      executionMode: debugExecutionMode,
      intent: debugIntent,
    });
  }, [agentMode, loading, streaming, error, debugExecutionMode, debugIntent]);

  // ---------------------------------------------------------------

  return (
    // 1. USE 100dvh (Dynamic Viewport Height) to fix mobile browser bar cutoffs
    <div className="flex flex-col h-full bg-background text-foreground relative overflow-hidden">
      <KoFiNudge isOpen={showNudge} onClose={dismissNudge} />
      <FileGateNudge isOpen={showFileGateNudge} onClose={() => setShowFileGateNudge(false)} />

      {/* Header - Compact: structural nav + overflow menu */}
      <header className="flex-none px-3 py-2 sm:px-4 sm:py-3 border-b border-border/40 bg-background/80 backdrop-blur-md z-20 flex items-center justify-between sticky top-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-sky-500/10 flex items-center justify-center shrink-0">
            <ChatBubbleIcon className="h-4 w-4 text-sky-600 dark:text-sky-400" />
          </div>
          <h1 className="text-sm font-semibold leading-tight truncate">Weaver</h1>
        </div>

        {/* Desktop-only indicators */}
        <div className="hidden md:flex items-center gap-2">
          <RuntimeStatusBar
            agentMode={agentMode}
            loading={loading}
            streaming={streaming}
            streamingContent={streamingContent}
            error={error}
            executionMode={debugExecutionMode}
            intent={debugIntent}
            pendingApproval={false}
          />
          {conversationContext.workspaceId && (
            <SyncStatusIndicator
              syncStatus={syncStatus}
              variant="compact"
            />
          )}
          <MemoryInsights
            memoryCount={memoryCount}
            isMemoryPulsing={isMemoryPulsing}
            variant="compact"
          />
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={async () => {
              const newConv = await createNewConversation();
              if (newConv) {
                clearSessionMemoryStorage(conversationId);
                window.location.href = `/conversation/${newConv.id}`;
              }
            }}
          >
            <Plus className="h-3 w-3" />
            New Chat
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={handleGitHubConnect}
            title="Connect GitHub"
          >
            <BrandIcon name="Github" className="h-4 w-4" size={16} />
          </Button>
        </div>

        {/* Mobile overflow menu */}
        <div className="flex md:hidden items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground"
            onClick={() => setShowMobileMenu(true)}
            aria-label="More options"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 12.75a.75.75 0 110-1.5.75.75 0 010 1.5zM12 18.75a.75.75 0 110-1.5.75.75 0 010 1.5z" />
            </svg>
          </Button>
        </div>
      </header>

      {/* Mobile Menu Overlay */}
      {showMobileMenu && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowMobileMenu(false)} />
          <div className="absolute right-0 top-0 h-full w-72 bg-background border-l border-border p-4 shadow-xl">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-semibold">Options</h2>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowMobileMenu(false)}>
                <X className="h-5 w-5" />
              </Button>
            </div>
            <div className="space-y-4">
              <ModelToggle disabled={loading || streaming} />
              <RuntimeStatusBar
                agentMode={agentMode}
                loading={loading}
                streaming={streaming}
                streamingContent={streamingContent}
                error={error}
                executionMode={debugExecutionMode}
                intent={debugIntent}
                pendingApproval={false}
              />
              {conversationContext.workspaceId && (
                <SyncStatusIndicator
                  syncStatus={syncStatus}
                  variant="compact"
                />
              )}
              <MemoryInsights
                memoryCount={memoryCount}
                isMemoryPulsing={isMemoryPulsing}
                variant="mobile"
              />
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={async () => {
                  const newConv = await createNewConversation();
                  if (newConv) {
                    clearSessionMemoryStorage(conversationId);
                    window.location.href = `/conversation/${newConv.id}`;
                  }
                }}
              >
                <Plus className="h-4 w-4" />
                New Chat
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full justify-start gap-2"
                onClick={handleGitHubConnect}
              >
                <BrandIcon name="Github" className="h-4 w-4" size={16} />
                Connect GitHub
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Main Chat Area - Flex grow with native scroll for better mobile feel */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden w-full scroll-smooth">
        <div className="max-w-3xl mx-auto w-full px-4 py-6 md:px-6 min-h-0">

          {/* Context Summary Chip — collapsed on mobile, expanded on desktop */}
          {(conversationContext.workspaceName || conversationContext.operatingProfileName) && (
            <div className="mb-4">
              {/* Mobile: single tap-to-expand chip */}
              <button
                type="button"
                onClick={() => setShowContextSheet((v) => !v)}
                className="md:hidden w-full flex items-center justify-between rounded-xl border border-sky-500/15 bg-sky-500/5 px-3 py-2 text-left"
              >
                <div className="flex items-center gap-2 text-xs font-medium">
                  <Layers3 className="h-3.5 w-3.5 text-violet-600 dark:text-violet-400" />
                  <span className="text-foreground">
                    {conversationContext.workspaceName || conversationContext.operatingProfileName}
                  </span>
                  <span className="text-muted-foreground">
                    · {modeLabel(conversationContext.operatingProfileMode)}
                  </span>
                </div>
                <svg className={cn("h-4 w-4 text-muted-foreground transition-transform", showContextSheet && "rotate-180")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {/* Desktop: full info box (original) */}
              <div className="hidden md:block rounded-2xl border border-sky-500/15 bg-sky-500/5 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2 text-xs font-medium mb-2">
                  {conversationContext.workspaceName && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 text-violet-700 dark:text-violet-300">
                      <Layers3 className="h-3.5 w-3.5" />
                      {conversationContext.workspaceName}
                    </span>
                  )}
                  {conversationContext.operatingProfileName && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/10 px-2.5 py-1 text-sky-700 dark:text-sky-300">
                      <ProfileModeIcon mode={conversationContext.operatingProfileMode} className="h-3.5 w-3.5" />
                      {conversationContext.operatingProfileName}
                    </span>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {conversationContext.operatingProfileName
                    ? `This conversation is running inside your workspace with the ${modeLabel(conversationContext.operatingProfileMode)} profile. Per-task prompting can be shaped here instead of forcing a global chat mode.`
                    : 'This conversation is attached to your active workspace context.'}
                </p>
              </div>

              {/* Mobile context bottom sheet */}
              {showContextSheet && (
                <div className="fixed inset-0 z-40 md:hidden">
                  <div className="absolute inset-0 bg-black/50" onClick={() => setShowContextSheet(false)} />
                  <div className="absolute bottom-0 left-0 right-0 rounded-t-2xl bg-background border-t border-border p-4 shadow-xl">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-sm font-semibold">Context</h3>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setShowContextSheet(false)}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="space-y-3">
                      {conversationContext.workspaceName && (
                        <div className="flex items-center gap-2 rounded-lg border border-violet-500/20 bg-violet-500/10 px-3 py-2 text-sm">
                          <Layers3 className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                          <span className="font-medium">{conversationContext.workspaceName}</span>
                        </div>
                      )}
                      {conversationContext.operatingProfileName && (
                        <div className="flex items-center gap-2 rounded-lg border border-sky-500/20 bg-sky-500/10 px-3 py-2 text-sm">
                          <ProfileModeIcon mode={conversationContext.operatingProfileMode} className="h-4 w-4 text-sky-600 dark:text-sky-400" />
                          <span className="font-medium">{conversationContext.operatingProfileName}</span>
                          <span className="text-xs text-muted-foreground">· {modeLabel(conversationContext.operatingProfileMode)}</span>
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {conversationContext.operatingProfileName
                          ? `This conversation is running inside your workspace with the ${modeLabel(conversationContext.operatingProfileMode)} profile.`
                          : 'This conversation is attached to your active workspace context.'}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <ContextualNudge 
            className="mb-6 animate-in fade-in slide-in-from-top-2 duration-500" 
            actionIntended={agentMode === 'agentic' ? 'agentic execution' : undefined} 
          />

          {/* Greeting / Empty State */}
          {showGreeting && (
            <div className="flex flex-col items-center justify-center min-h-[40vh] text-center animate-in fade-in zoom-in duration-500">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-sky-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-6">
                <Sparkles className="h-8 w-8 text-white" />
              </div>
              <div className="space-y-2 max-w-xl mb-6">
                <h2 className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">
                  {initialConsultantGreeting ? 'Your consultant is ready' : 'What would you like to explore?'}
                </h2>
                <p className="text-muted-foreground text-sm md:text-base leading-relaxed">
                  {initialConsultantGreeting
                    ? initialConsultantGreeting
                    : 'Start a conversation, attach a file, or choose a prompt below to see Lattice in action.'}
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full max-w-2xl">
                {[
                  'Help me think through an architecture decision',
                  'Review this code and suggest improvements',
                  'Research a topic and summarize what you find',
                  'Generate an image from a short description',
                ].map((suggestion) => (
                  <button
                    key={suggestion}
                    onClick={() => setUserInput(suggestion)}
                    className="text-left rounded-2xl border border-border bg-card hover:bg-accent/60 hover:border-primary/40 px-4 py-3 text-sm md:text-base text-foreground transition-colors duration-200"
                  >
                    {suggestion}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Message List */}
          {messages.map((msg, index) => (
            <div key={index} className={cn(
              "group w-full mb-6 flex",
              msg.role === "user" ? "justify-end" : "justify-start"
            )}>
              <div className={cn(
                "flex max-w-[90%] md:max-w-[85%] gap-3",
                msg.role === "user" ? "flex-row-reverse" : "flex-row"
              )}>
                {/* Avatars */}
                <div className="flex-shrink-0 mt-1">
                  {msg.role === "bot" ? (
                    <Avatar className="h-8 w-8 ring-1 ring-border/50 bg-background">
                      <AvatarImage src="/lattice-logo.png" alt="Weaver avatar" />
                      <AvatarFallback className="text-[10px] bg-gradient-to-br from-indigo-500 to-purple-500 text-white">AI</AvatarFallback>
                    </Avatar>
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <PersonIcon className="h-4 w-4 text-primary" />
                    </div>
                  )}
                </div>

                {/* Content Bubble */}
                <div className={cn(
                  "relative text-sm md:text-base leading-relaxed break-words min-w-0",
                  msg.role === "user"
                    ? "bg-secondary text-secondary-foreground rounded-[20px] rounded-tr-sm px-4 py-3 md:px-5 md:py-4 shadow-sm" // Claude-style user bubble
                    : "bg-transparent text-foreground px-0 py-0" // Gemini/Claude-style bot (no bubble)
                )}>
                  {msg.role === "bot" ? (
                    <>
                      {(() => {
                        const { text: artifactFreeText, artifacts } = parseArtifacts(msg.text);
                        return (
                          <>
                            {artifacts.map((artifact, artifactIndex) => (
                              <ArtifactCard key={`${conversationId}:${index}:artifact:${artifactIndex}`} artifact={artifact} />
                            ))}
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm]}
                              components={{
                                table: RenderTableAsChart,
                                pre: ({ node, ...props }) => (
                                  <div className="relative w-full overflow-hidden my-4 rounded-xl border bg-zinc-950 dark:bg-zinc-900 shadow-md">
                                    <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800">
                                      <span className="text-xs text-zinc-400 font-mono">code</span>
                                    </div>
                                    <pre {...props} className="p-4 overflow-x-auto text-xs text-zinc-50 font-mono leading-relaxed scrollbar-thin scrollbar-thumb-zinc-700" />
                                  </div>
                                ),
                                code({ node, className, children, ...props }) {
                                  const match = /language-(\w+)/.exec(className || '');
                                  return match ? (
                                    <code className={className} {...props}>{children}</code>
                                  ) : (
                                    <code className="bg-muted px-1.5 py-0.5 rounded-md font-mono text-[13px] text-pink-600 dark:text-pink-400" {...props}>{children}</code>
                                  );
                                },
                                p: ({ node, ...props }) => <p {...props} className="mb-4 last:mb-0" />,
                                ul: ({ node, ...props }) => <ul {...props} className="list-disc list-outside ml-4 mb-4 space-y-2 marker:text-muted-foreground" />,
                                ol: ({ node, ...props }) => <ol {...props} className="list-decimal list-outside ml-4 mb-4 space-y-2 marker:text-muted-foreground" />,
                                li: ({ node, ...props }) => <li {...props} className="pl-1" />,
                                h1: ({ node, ...props }) => <h1 {...props} className="text-2xl font-semibold mb-4 mt-6 first:mt-0 tracking-tight" />,
                                h2: ({ node, ...props }) => <h2 {...props} className="text-xl font-semibold mb-3 mt-5 tracking-tight" />,
                                h3: ({ node, ...props }) => <h3 {...props} className="text-lg font-medium mb-2 mt-4" />,
                                blockquote: ({ node, ...props }) => <blockquote {...props} className="border-l-4 border-primary/40 pl-4 italic text-muted-foreground my-4" />,
                                a: ({ node, ...props }) => <a {...props} className="text-indigo-500 hover:text-indigo-600 font-medium underline underline-offset-4 transition-colors" target="_blank" rel="noreferrer" />,
                                th: ({ node, ...props }) => <th {...props} className="border-b border-border px-4 py-2 text-left font-semibold bg-muted/30" />,
                                td: ({ node, ...props }) => <td {...props} className="border-b border-border px-4 py-2" />,
                              }}
                            >
                              {artifactFreeText}
                            </ReactMarkdown>
                          </>
                        );
                      })()}

                      {/* Action Bar (Copy/Share + Feedback) - fades in */}
                      <div className="mt-2 flex gap-2 items-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <ShareIconButton
                          content={{
                            title: "Weaver Response",
                            text: msg.text.substring(0, 300),
                            url: typeof window !== "undefined" ? window.location.href : undefined,
                          }}
                          className="h-8 w-8 bg-background border rounded-full hover:bg-muted text-muted-foreground"
                        />

                        {index > 0 && messages[index - 1]?.role === "user" && (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="h-8 px-3 rounded-full border bg-background text-xs text-muted-foreground hover:bg-muted"
                              onClick={() =>
                                submitFeedback({
                                  source: "web",
                                  conversationId,
                                  messageId: `${conversationId}:${index}`,
                                  input: messages[index - 1]?.text ?? "",
                                  output: msg.text,
                                  rating: 1,
                                  labels: ["thumbs_up"],
                                  promptVersion: "conversation-page",
                                  model: agentMode,
                                })
                              }
                            >
                              👍
                            </button>
                            <button
                              type="button"
                              className="h-8 px-3 rounded-full border bg-background text-xs text-muted-foreground hover:bg-muted"
                              onClick={() =>
                                submitFeedback({
                                  source: "web",
                                  conversationId,
                                  messageId: `${conversationId}:${index}`,
                                  input: messages[index - 1]?.text ?? "",
                                  output: msg.text,
                                  rating: -1,
                                  labels: ["thumbs_down"],
                                  promptVersion: "conversation-page",
                                  model: agentMode,
                                })
                              }
                            >
                              👎
                            </button>
                          </div>
                        )}
                      </div>
                      <SourceDisplay sources={msg.sources || []} />
                      {msg.modelSwitch && (
                        <div className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-muted bg-muted/30 px-2 py-1 text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/80">Model fallback</span>
                          <span>{msg.modelSwitch.from}</span>
                          <span aria-hidden>→</span>
                          <span>{msg.modelSwitch.to}</span>
                          {msg.modelSwitch.reason ? (
                            <span className="text-muted-foreground/70">({msg.modelSwitch.reason})</span>
                          ) : null}
                        </div>
                      )}
                      {msg.approvalRequest && (
                        <MediaApprovalCard
                          approvalRequest={msg.approvalRequest}
                          onResolved={(media) => {
                            setMessages((prev) =>
                              prev.map((m) =>
                                m.timestamp.getTime() === msg.timestamp.getTime()
                                  ? { ...m, media, approvalRequest: undefined }
                                  : m
                              )
                            );
                          }}
                        />
                      )}
                      {msg.media && msg.media.length > 0 && (
                        <div className="mt-3">
                          {msg.media.map((env, i) => (
                            <InlineMediaCard key={`${msg.timestamp.getTime()}-media-${i}`} envelope={env} />
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Streaming Message - Current chunk */}
          {streaming && streamingContent && (
            <div className="group w-full mb-6 flex justify-start">
              <div className="flex max-w-[90%] md:max-w-[85%] gap-3 flex-row">
                <div className="flex-shrink-0 mt-1">
                  <Avatar className="h-8 w-8 ring-1 ring-border/50 bg-background">
                    <AvatarImage src="/lattice-logo.png" alt="Weaver avatar" />
                    <AvatarFallback className="text-[10px] bg-gradient-to-br from-indigo-500 to-purple-500 text-white">AI</AvatarFallback>
                  </Avatar>
                </div>
                <div className="relative text-sm md:text-base leading-relaxed break-words bg-transparent text-foreground px-0 py-0 animate-pulse">
                  <p className="whitespace-pre-wrap">{streamingContent}</p>
                </div>
              </div>
            </div>
          )}

          {loading && !streamingContent && <TypingIndicator agentMode={agentMode} />}

          {/* Error Message */}
          {error && (
            <div className="flex justify-center mb-4 animate-in fade-in slide-in-from-bottom-2">
              <div className="flex items-center gap-2 text-destructive bg-destructive/5 border border-destructive/20 px-4 py-2 rounded-full text-sm">
                <AlertCircle className="h-4 w-4" />
                {error}
              </div>
            </div>
          )}

          {/* Invisible element to scroll to */}
          <div ref={bottomRef} className="h-4" />
        </div>
      </div>

      {/* Scroll to Bottom Button */}
      {showScrollButton && <ScrollToBottom onClick={scrollToBottom} />}

      {/* Input Area - Floating & Glassmorphism */}
      <Composer
        workspaceId={conversationContext.workspaceId}
        userInput={userInput}
        loading={loading}
        agentMode={agentMode}
        swarmSuggestion={swarmSuggestion}
        selectedFile={selectedFile}
        showFilePreview={showFilePreview}
        fileInputRef={fileInputRef}
        uploadedDocs={uploadedDocs}
        setUploadedDocs={setUploadedDocs}
        handleInputChange={handleInputChange}
        handleSendMessage={handleSendMessage}
        handleKeyPress={handleKeyPress}
        handleFileChange={handleFileChange}
        togglePreview={togglePreview}
        removeFile={removeFile}
      />
    </div>
  );
}

export default ConversationPageGlobalWrapper;