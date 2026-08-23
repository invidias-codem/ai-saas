"use client";

import React, { useState, useRef, ChangeEvent, KeyboardEvent, useEffect, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

import { KoFiNudge } from "@/components/kofi-nudge";
import { FileGateNudge } from "@/components/file-gate-nudge";
import { useSupportNudge } from "@/hooks/use-support-nudge";
import { Heading } from "@/components/heading";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
// Note: We are opting for native div scrolling for better mobile behavior, 
// but keeping the import if you use it elsewhere.
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Paperclip, AlertCircle, SendHorizontal, X, Plus, ArrowDown, Code, Sparkles, Layers3, Cpu, Search, Zap, FileText, Brain, Activity, Wrench } from "lucide-react";
import { BrandIcon } from "@/lib/icons/brandIcons";
import { GitHubConsentModal } from "@/components/github-consent-modal";
import { ShareIconButton } from "@/components/share-button";
import { cn } from "@/lib/utils";
import { ChatBubbleIcon, PersonIcon } from "@radix-ui/react-icons";
import { submitFeedback } from "@/lib/feedback/submitFeedback";
import { NeuralArchivalUploader, UploadedDoc } from "@/components/documents/NeuralArchivalUploader";
import { FileItem } from "@/components/documents/FileItem";
import { FilePreview } from "@/components/FilePreview";
import { ContextualNudge } from "@/components/workspaces/ContextualNudge";
import {
  getSessionMemoryFromStorage,
  saveSessionMemoryToStorage,
  getOrCreateSessionId,
  clearSessionMemoryStorage,
  SessionMessage,
  getMemoryStats
} from "@/lib/sessionClientMemory";
import { useSessionCleanup } from "@/lib/useSessionCleanup";
import {
  getOrCreateDeviceId,
  getDeviceInfo,
  getDeviceName
} from "@/lib/deviceIdentifier";
import {
  registerSyncSession,
  detectMultiDeviceLogin,
  trackMessageSent,
  getSyncStatus
} from "@/lib/deviceSync";
import { toSyncMessages } from "@/lib/messageMerge";
import {
  createNewConversation,
  getActiveConversationId,
  setActiveConversation,
} from "@/lib/conversationManager";
import { useSupabaseChat, Message as SupabaseMessage } from "@/app/hooks/useSupabaseChat";
import { useRuntimeStore } from "@/lib/store/runtimeStore";
import { usePricingModal } from "@/lib/store/pricing-modal-store";

// New Agentic Integration
import { ModelProvider, useModel } from "@/contexts/ModelContext";
import { ModelToggle } from "@/components/chat/ModelToggle";
import { SourceDisplay, Source } from "@/components/chat/SourceDisplay";
import { ArtifactCard } from "@/components/chat/ArtifactCard";
import { parseArtifacts } from "@/lib/llm/artifacts";

// Removed manual compression - relying on native HTTP compression (Brotli/Gzip)

// Message structure
interface Message {
  text: string;
  role: "user" | "bot";
  timestamp: Date;
  sources?: Source[];
}

interface ConversationContext {
  workspaceId: string | null;
  workspaceName: string | null;
  operatingProfileId: string | null;
  operatingProfileName: string | null;
  operatingProfileMode: string | null;
}

// Selected file structure
interface SelectedFile {
  file: File;
  preview: string;
  name: string;
  type: string;
  mimeType?: string;
  sizeBytes?: number;
  storageProvider?: string;
  base64Data?: string;
  fileUri?: string; // GCS URI for large files
  isUploading?: boolean;
}

const readFileAsBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

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

function modeIcon(mode?: string | null) {
  switch (mode) {
    case 'research': return Search;
    case 'agentic': return Zap;
    case 'drafting': return FileText;
    case 'memory_native': return Brain;
    case 'copilot': return Cpu;
    default: return Cpu;
  }
}

// ─── Runtime Status Helpers ──────────────────────────────────────

type RuntimeState = 'idle' | 'thinking' | 'executing_tools' | 'streaming' | 'error';

function getRuntimeState({
  loading,
  streaming,
  streamingContent,
  error,
  agentMode,
}: {
  loading: boolean;
  streaming: boolean;
  streamingContent: string;
  error: string | null;
  agentMode: string | undefined;
}): RuntimeState {
  if (error) return 'error';
  if (streaming && streamingContent) return 'streaming';
  if (loading && agentMode === 'agentic') return 'executing_tools';
  if (loading) return 'thinking';
  return 'idle';
}

function runtimeLabel(state: RuntimeState, agentMode?: string) {
  switch (state) {
    case 'thinking': return 'Thinking';
    case 'executing_tools': return 'Executing tools';
    case 'streaming': return 'Streaming response';
    case 'error': return 'Error';
    default: return agentMode ? modeLabel(agentMode) : 'Ready';
  }
}

function runtimeColor(state: RuntimeState) {
  switch (state) {
    case 'thinking': return 'text-amber-600 dark:text-amber-400';
    case 'executing_tools': return 'text-violet-600 dark:text-violet-400';
    case 'streaming': return 'text-sky-600 dark:text-sky-400';
    case 'error': return 'text-red-600 dark:text-red-400';
    default: return 'text-emerald-600 dark:text-emerald-400';
  }
}

const RuntimeStatusBar = ({
  agentMode,
  loading,
  streaming,
  streamingContent,
  error,
  executionMode,
  intent,
  pendingApproval,
}: {
  agentMode: string | undefined;
  loading: boolean;
  streaming: boolean;
  streamingContent: string;
  error: string | null;
  executionMode?: string;
  intent?: string;
  pendingApproval?: boolean;
}) => {
  const state = getRuntimeState({ loading, streaming, streamingContent, error, agentMode });
  const Icon = state === 'executing_tools' ? Wrench : Activity;
  const label = runtimeLabel(state, agentMode);
  const color = runtimeColor(state);

  return (
    <div className={cn(
      "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-all duration-300",
      color,
      state !== 'idle' && "border-current/20 bg-current/5"
    )}>
      <Icon className="h-3 w-3" />
      <span>{label}</span>
      {executionMode && state !== 'idle' && (
        <span className="text-muted-foreground">· {executionMode}</span>
      )}
      {intent && state !== 'idle' && (
        <span className="text-muted-foreground">· {intent}</span>
      )}
      {pendingApproval && (
        <span className="text-amber-600 dark:text-amber-400 animate-pulse">· Awaiting approval</span>
      )}
      {agentMode && state === 'idle' && !pendingApproval && (
        <span className="text-muted-foreground">· {modeLabel(agentMode)}</span>
      )}
    </div>
  );
};

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
  const ProfileIcon = modeIcon(conversationContext.operatingProfileMode);
  const [messages, setMessages] = useState<Message[]>(() => 
    initialMessages.map(msg => ({
      ...msg,
      timestamp: new Date(msg.timestamp)
    }))
  );

  // Nudge Integration
  const { showNudge, trackActivity, dismissNudge } = useSupportNudge();

  // Sync Supabase messages to local state with deduplication
  useEffect(() => {
    if (supabaseMessages && supabaseMessages.length > 0) {
      setMessages(prev => {
        // Merge: keep optimistic user messages not yet in Supabase
        const supabaseTimestamps = new Set(supabaseMessages.map(m => m.timestamp.getTime()));
        const pendingOptimistic = prev.filter(
          m => m.role === 'user' && !supabaseTimestamps.has(m.timestamp.getTime())
        );
        return [...supabaseMessages, ...pendingOptimistic];
      });
      setShowGreeting(false);
    }
  }, [supabaseMessages]);

  const [userInput, setUserInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showContextSheet, setShowContextSheet] = useState(false);
  const [showGreeting, setShowGreeting] = useState<boolean>(() => Boolean(initialConsultantGreeting));
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [showFilePreview, setShowFilePreview] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<UploadedDoc[]>([]);
  const [showFileGateNudge, setShowFileGateNudge] = useState(false);
  const { open: openPricingModal } = usePricingModal();
  const [sessionId, setSessionId] = useState("");
  const [sessionRestored, setSessionRestored] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [multiDeviceStatus, setMultiDeviceStatus] = useState<any>(null);
  const [userId, setUserId] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [memoryCount, setMemoryCount] = useState<number>(0);
  const [isMemoryPulsing, setIsMemoryPulsing] = useState(false);
  const [swarmSuggestion, setSwarmSuggestion] = useState<string>("");
  const [debugExecutionMode, setDebugExecutionMode] = useState<string | undefined>(undefined);
  const [debugIntent, setDebugIntent] = useState<string | undefined>(undefined);

  useEffect(() => {
    const fetchSuggestion = async () => {
      try {
        // Asynchronously fetch episodic memory suggestion to avoid blocking render
        const res = await fetch(`/api/memory/episodic?workspaceId=${conversationContext.workspaceId || ''}`);
        if (res.ok) {
          const data = await res.json();
          if (data.suggestion) {
            setSwarmSuggestion(data.suggestion);
          }
        }
      } catch (e) {
        // Fail silently to avoid interrupting the UX
      }
    };
    
    // Only fetch if we are in a fresh conversation (no messages yet)
    if (initialMessages.length === 0) {
      fetchSuggestion();
    }
  }, [conversationContext.workspaceId, initialMessages.length]);

  // GitHub Consent State
  const [isGitHubModalOpen, setIsGitHubModalOpen] = useState(false);
  const [gitHubAction, setGitHubAction] = useState<any>(null);

  const handleGitHubConnect = () => {
    window.location.href = "/api/integrations/github/auth"; // Trigger OAuth
  };

  const handleGitHubActionConfirm = async () => {
    setIsGitHubModalOpen(false);

    const action = gitHubAction;
    const botMessage: Message = {
      text: `⏳ Executing GitHub Action: ${action?.type} \`${action?.repo}\`${action?.target ? ` → ${action.target}` : ""}…`,
      role: "bot",
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, botMessage]);

    try {
      const { data } = await fetch("/api/integrations/github/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: action?.type, repo: action?.repo, target: action?.target }),
      }).then((res) => res.json());

      const successText =
        typeof data?.html_url === "string"
          ? `✅ Done — ${action?.type} on \`${action?.repo}\`: ${data.html_url}`
          : `✅ Successfully executed GitHub Action: ${action?.type} on \`${action?.repo}\``;

      setMessages((prev) => [...prev, { text: successText, role: "bot", timestamp: new Date() }]);
    } catch (err: any) {
      setMessages((prev) => [...prev, { text: `❌ Failed to execute GitHub action: ${err?.message || "unknown error"}`, role: "bot", timestamp: new Date() }]);
      setError(err?.message || "GitHub action failed.");
    } finally {
      setGitHubAction(null);
    }
  };

  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null); // For auto-scroll
  const chatContainerRef = useRef<HTMLDivElement>(null); // Chat container for scroll
  const sessionCleanup = useSessionCleanup();
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const GREETING_MESSAGE = "Hi there! How can I assist you today? Feel free to ask me anything or attach a file for insights.";

  // No auto-scroll - let users scroll manually to read responses from the beginning

  // Scroll to bottom function for manual trigger
  const scrollToBottom = () => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTo({
        top: chatContainerRef.current.scrollHeight,
        behavior: 'smooth'
      });
    }
  };

  // Track scroll position to show/hide scroll-to-bottom button
  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // Show button when scrolled up more than 200px from bottom
      const isScrolledUp = scrollHeight - scrollTop - clientHeight > 200;
      setShowScrollButton(isScrolledUp && messages.length > 2);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [messages.length]);

  // --- Session & Sync Effects (Identical Logic to your original) ---
  useEffect(() => {
    const initializeSession = async () => {
      try {
        const sid = getOrCreateSessionId();
        setSessionId(sid);
        const did = getOrCreateDeviceId();
        setDeviceId(did);
        const savedMessages = getSessionMemoryFromStorage(conversationId); // Pass conversation ID
        if (savedMessages.length > 0) {
          const restoredMessages: Message[] = savedMessages.map(msg => ({
            text: msg.text, role: msg.role, timestamp: new Date(msg.timestamp),
          }));
          setMessages(restoredMessages);
          setShowGreeting(false);
        }
        try {
          const response = await fetch('/api/auth/user');
          if (response.ok) {
            const data = await response.json();
            setUserId(data.userId);
            registerSyncSession(data.userId, savedMessages.length);
            const status = detectMultiDeviceLogin(data.userId);
            setMultiDeviceStatus(status);
          }
        } catch (err) { console.warn('[DeviceSync] Could not fetch user info:', err); }
        setSessionRestored(true);
      } catch (err) { console.error('[SessionMemory] Failed:', err); setSessionRestored(true); }
    };
    initializeSession();
  }, [conversationId]);

  useEffect(() => {
    if (!sessionRestored || !sessionId || messages.length === 0 || !conversationId) {
      return;
    }

    const sessionMessages: SessionMessage[] = messages.map(msg => ({
      text: msg.text, role: msg.role, timestamp: msg.timestamp.getTime(),
    }));
    saveSessionMemoryToStorage(sessionMessages, 'current-user', sessionId, conversationId); // Include conversationId
    if (deviceId) trackMessageSent(messages.length);
  }, [messages, sessionRestored, sessionId, deviceId, conversationId]);

  // Conversation-scoped cloud sync for multi-device support
  useEffect(() => {
    if (!sessionRestored || !userId || !deviceId || messages.length === 0 || !conversationId) return;

    const syncToCloud = async () => {
      try {
        const messagesToSync = messages.map(msg => ({ text: msg.text, role: msg.role, timestamp: msg.timestamp.getTime() }));
        const syncMessages = toSyncMessages(messagesToSync, deviceId);

        // IMPORTANT: Pass conversationId to scope sync to THIS conversation only
        const response = await axios.post('/api/sync/conversation', {
          deviceId,
          messages: syncMessages,
          isNewDevice: false,
          lastSyncTimestamp: Date.now(),
          conversationId, // <-- Conversation-scoped sync!
        });

        if (response.data.merged) {
          const mergedMessages: Message[] = response.data.merged.map((m: any) => ({
            text: m.text, role: m.role, timestamp: new Date(m.timestamp),
          }));
          // Only update if we got MORE messages (from another device)
          if (mergedMessages.length > messages.length) {
            setMessages(mergedMessages);
            saveSessionMemoryToStorage(
              mergedMessages.map(msg => ({ text: msg.text, role: msg.role, timestamp: msg.timestamp.getTime() })),
              'current-user',
              sessionId,
              conversationId
            );
          }
          if (response.data.deviceCount > 1) {
            setMultiDeviceStatus({ isMultiDevice: true, deviceCount: response.data.deviceCount });
          }
        }
      } catch (err: any) {
        console.warn('[DeviceSync] Sync failed:', err);
      }
    };

    // Initial sync after 10 seconds, then every 5 minutes
    const initialTimeout = setTimeout(syncToCloud, 10000);
    const syncInterval = setInterval(syncToCloud, 5 * 60 * 1000);
    syncIntervalRef.current = syncInterval;

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(syncInterval);
    };
  }, [sessionRestored, userId, deviceId, messages, sessionId, conversationId]);

  // Fetch Memory Count
  const fetchMemoryCount = async () => {
    try {
      const res = await axios.get("/api/memory/count");
      if (res.data.count !== undefined) {
        setMemoryCount(res.data.count);
      }
    } catch (err) {
      console.error("Failed to fetch memory count:", err);
    }
  };

  useEffect(() => {
    fetchMemoryCount();
  }, []);

  // Trigger fetch on new message (bot response)
  useEffect(() => {
    if (messages.length > 0) {
      fetchMemoryCount();
      setIsMemoryPulsing(true);
      const timer = setTimeout(() => setIsMemoryPulsing(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [messages.length]);

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

  // ─── Sync approval state to global store ──────────────────────────────────
  useEffect(() => {
    const store = useRuntimeStore.getState();
    if (gitHubAction) {
      store.setPendingApproval({
        type: gitHubAction.type,
        repo: gitHubAction.repo,
        target: gitHubAction.target,
      });
    } else {
      store.clearPendingApproval();
    }
  }, [gitHubAction]);

  // ---------------------------------------------------------------

  const handleSendMessage = async () => {
    const trimmedInput = userInput.trim();
    if (!trimmedInput && !selectedFile && uploadedDocs.length === 0) return;
    if (selectedFile?.isUploading) {
      setError("Please wait for file upload to complete.");
      return;
    }

    setLoading(true); setError(null); setShowGreeting(false);

    let messageText = trimmedInput;
    if (selectedFile) { messageText += `\n\n[Attached File: ${selectedFile.name} (${selectedFile.type})]`; }

    const userMessage: Message = { text: messageText, role: "user", timestamp: new Date() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages); setUserInput("");
    setStreaming(true);
    setStreamingContent("");

    // Capture file data before clearing state
    const filePayload = selectedFile
      ? selectedFile.fileUri
        ? {
            name: selectedFile.name,
            type: selectedFile.type,
            mimeType: selectedFile.mimeType || selectedFile.type,
            sizeBytes: selectedFile.sizeBytes,
            fileUri: selectedFile.fileUri,
            storageProvider: selectedFile.storageProvider || 'gcs',
          }
        : selectedFile.base64Data
          ? {
              name: selectedFile.name,
              type: selectedFile.type,
              mimeType: selectedFile.mimeType || selectedFile.type,
              sizeBytes: selectedFile.sizeBytes,
              base64Data: selectedFile.base64Data,
            }
          : undefined
      : undefined;

    setSelectedFile(null);
    setShowFilePreview(false);

    try {
      // Dispatcher Call (Fetch with Streaming)
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          conversationId,
          userId,
          prompt: messageText,
          fileData: filePayload,
          documentIds: uploadedDocs.map(d => d.id), // Send the document IDs reference
          messages: newMessages.map(m => ({ role: m.role, text: m.text })), // Send history for context
          mode: agentMode, // Pass the active agent mode
        })
      });

      // Clear uploaded docs after successful send
      // Note: We keep uploadedDocs in state for RAG retrieval on follow-up turns
      // The conversation engine uses documentIds to retrieve relevant chunks
      // setUploadedDocs([]);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let accum = "";

      if (reader) {
        while (!done) {
          const { value, done: doneReading } = await reader.read();
          done = doneReading;
          if (value) {
            const chunk = decoder.decode(value, { stream: true });
            accum += chunk;
            setStreamingContent(prev => prev + chunk);
          }
        }
      }

      // Finalize message
      const sourcesHeader = response.headers.get("X-Weaver-Sources") || response.headers.get("X-Genie-Sources");
      let sources: Source[] = [];
      if (sourcesHeader) {
        try {
          sources = JSON.parse(sourcesHeader);
        } catch (e) {
          console.error("Failed to parse sources header", e);
        }
      }

      const debugExecutionMode = response.headers.get("X-Debug-Execution-Mode") || undefined;
      const debugIntent = response.headers.get("X-Debug-Intent") || undefined;
      setDebugExecutionMode(debugExecutionMode);
      setDebugIntent(debugIntent);

      // Check for pricing nudge trigger from server
      if (response.headers.get("x-trigger-nudge") === "true") {
        openPricingModal();
      }

      // Check for file upload gated — show mobile-friendly donation nudge
      if (response.headers.get("x-file-gated") === "true") {
        setShowFileGateNudge(true);
      }

      const cleanedAccum = accum.replace(/<thought_signature>[\s\S]*?<\/thought_signature>/gi, '').trim();
      setMessages(prev => [...prev, { text: cleanedAccum, role: "bot", timestamp: new Date(), sources }]);
      setStreamingContent("");
      setStreaming(false);

    } catch (error: any) {
      console.error("Error sending message:", error);
      if (error?.status === 401 || (error.response && error.response.status === 401)) {
        window.location.href = "/sign-in?redirect_url=" + encodeURIComponent(window.location.pathname);
        return;
      }
      setError(error.message || "Sorry, something went wrong.");
      setStreaming(false);
    } finally {
      setLoading(false);
      trackActivity("message");
    }
  };

  const handleAttachClick = () => { fileInputRef.current?.click(); };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      const isLargeFile = file.size > 4 * 1024 * 1024; // 4MB

      const newFileState: SelectedFile = {
        file,
        preview: objectUrl,
        name: file.name,
        type: file.type,
        mimeType: file.type,
        sizeBytes: file.size,
        isUploading: isLargeFile
      };

      setSelectedFile(newFileState);
      setShowFilePreview(false);

      if (isLargeFile) {
        // Smart Upload: GCS Direct
        try {
          console.log(`[SmartUpload] File > 4MB (${(file.size / 1024 / 1024).toFixed(2)}MB). Using GCS Direct Upload.`);

          // 1. Get Signed URL
          const signRes = await axios.post('/api/storage/sign', {
            filename: file.name,
            contentType: file.type
          });

          const { uploadUrl, fileUri } = signRes.data;

          // 2. Upload to GCS
          const uploadRes = await fetch(uploadUrl, {
            method: 'PUT',
            headers: { 'Content-Type': file.type },
            body: file
          });

          if (!uploadRes.ok) {
            throw new Error(`Upload failed: ${uploadRes.statusText}`);
          }

          console.log(`[SmartUpload] Success! URI: ${fileUri}`);

          // 3. Update State
          setSelectedFile(prev => prev ? {
            ...prev,
            fileUri,
            storageProvider: 'gcs',
            base64Data: undefined,
            isUploading: false
          } : null);

        } catch (err: any) {
          console.error("Smart Upload Failed:", err);
          setError("Failed to upload large file. Please try a smaller one.");
          URL.revokeObjectURL(objectUrl); // Clean up memory
          setSelectedFile(null);
        }
      } else {
        // Standard Upload: Base64
        const base64 = await readFileAsBase64(file);
        setSelectedFile(prev => prev ? { ...prev, base64Data: base64 } : null);
      }
    }
    if (fileInputRef.current) { fileInputRef.current.value = ""; }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Modern Typing Indicator (Gemini Sparkle style)
  const TypingIndicator = () => {
    // Show 'Thinking' state for Agentic mode? or just standard dots
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
          <AvatarImage src="/Genie.png" alt="Weaver avatar" />
          <AvatarFallback className="bg-gradient-to-br from-indigo-500 to-purple-500 text-white text-xs">AI</AvatarFallback>
        </Avatar>
        <div className="flex items-center space-x-1.5 h-8">
          <div className="h-2 w-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
          <div className="h-2 w-2 bg-purple-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
          <div className="h-2 w-2 bg-sky-400 rounded-full animate-bounce"></div>
        </div>
      </div>
    );
  };

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
            pendingApproval={!!gitHubAction}
          />
          <div className={cn("text-[10px] text-muted-foreground transition-all duration-300 flex items-center gap-1", isMemoryPulsing && "text-indigo-500 font-bold scale-105")}>
            <span className={cn("w-1.5 h-1.5 rounded-full bg-indigo-500", isMemoryPulsing && "animate-ping")} />
            {memoryCount} memories
          </div>
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
                pendingApproval={!!gitHubAction}
              />
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                {memoryCount} memories
              </div>
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
                      <ProfileIcon className="h-3.5 w-3.5" />
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
                          <ProfileIcon className="h-4 w-4 text-sky-600 dark:text-sky-400" />
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

          {loading && !streamingContent && <TypingIndicator />}

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
      {
        showScrollButton && (
          <button
            onClick={scrollToBottom}
            className="fixed bottom-28 right-6 z-30 h-10 w-10 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg flex items-center justify-center transition-all duration-200 animate-in fade-in slide-in-from-bottom-2"
            aria-label="Scroll to bottom"
          >
            <ArrowDown className="h-5 w-5" />
          </button>
        )
      }

      {/* Input Area - Floating & Glassmorphism */}
      <div className="flex-none w-full p-4 bg-gradient-to-t from-background via-background to-transparent pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="max-w-3xl mx-auto relative">
          {/* File Preview Pill + expandable rich preview */}
          {selectedFile && (
            <div className="absolute bottom-full left-0 mb-3 w-full animate-in slide-in-from-bottom-2 fade-in">
              {/* Rich preview panel (image / PDF / text / docx / xlsx) */}
              {showFilePreview && (
                <div className="mb-2 max-w-md">
                  <FilePreview
                    file={selectedFile.file}
                    maxHeight="40vh"
                    showHeader={false}
                    allowFullscreen
                    allowDownload={false}
                  />
                </div>
              )}

              <div className="inline-flex items-center gap-2 bg-background border border-border shadow-sm px-3 py-1.5 rounded-full text-xs font-medium text-foreground">
                <Paperclip className="h-3 w-3 text-indigo-500" />
                <span className="max-w-[150px] truncate">{selectedFile.name}</span>
                {selectedFile.isUploading && (
                  <span className="text-[10px] text-muted-foreground">uploading…</span>
                )}
                <button
                  type="button"
                  onClick={() => setShowFilePreview((v) => !v)}
                  className="text-muted-foreground hover:text-indigo-500 transition-colors"
                  title={showFilePreview ? "Hide preview" : "Show preview"}
                  aria-label={showFilePreview ? "Hide file preview" : "Show file preview"}
                >
                  <FileText className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => {
                    if (selectedFile.preview) {
                      URL.revokeObjectURL(selectedFile.preview); // Clean up object URL
                    }
                    setSelectedFile(null);
                    setShowFilePreview(false);
                  }}
                  className="text-muted-foreground hover:text-destructive transition-colors ml-1"
                  aria-label="Remove attached file"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}

          {/* Input Container */}
          <div className="relative flex items-end gap-2 bg-muted/40 hover:bg-muted/60 focus-within:bg-background focus-within:ring-2 focus-within:ring-indigo-500/20 border border-border/50 rounded-[26px] p-2 transition-all duration-200 shadow-sm">
            
            {/* Left: attachment group (hidden on mobile, shown on desktop) */}
            <div className="hidden sm:block">
              <NeuralArchivalUploader 
                workspaceId={conversationContext.workspaceId || null} 
                docs={uploadedDocs}
                setDocs={setUploadedDocs}
              />
            </div>

            {/* Mobile: grouped + button for attachments */}
            <div className="sm:hidden relative">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                className="absolute inset-0 opacity-0 cursor-pointer"
                accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.md,.csv"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
                onClick={() => fileInputRef.current?.click()}
              >
                <Plus className="h-5 w-5" />
              </Button>
            </div>

            <Textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={swarmSuggestion || (agentMode === 'agentic' ? t("placeholderAgentic") : agentMode === 'quality' ? t("placeholderQuality") : t("placeholderFast"))}
              className="flex-1 min-h-[44px] max-h-[200px] border-0 focus-visible:ring-0 resize-none py-3 px-2 bg-transparent text-[15px] placeholder:text-muted-foreground/70 transition-all duration-700"
              rows={1}
            />

            {/* Send button — always visible, never pushed off-screen */}
            <Button
              onClick={handleSendMessage}
              disabled={loading || (!userInput.trim() && !selectedFile && uploadedDocs.length === 0)}
              className={cn(
                "rounded-full h-9 w-9 shrink-0 transition-all duration-300 shadow-sm",
                (userInput.trim() || selectedFile || uploadedDocs.length > 0)
                  ? "bg-indigo-600 hover:bg-indigo-700 text-white scale-100"
                  : "bg-muted text-muted-foreground opacity-50 scale-95 pointer-events-none"
              )}
            >
              {loading ? (
                <div className="h-4 w-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
              ) : (
                <SendHorizontal className="h-5 w-5 ml-0.5" />
              )}
            </Button>
          </div>
          <div className="text-center mt-2">
            <p className="text-[10px] text-muted-foreground/60">
              AI can make mistakes. Check important info.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConversationPageGlobalWrapper;