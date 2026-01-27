"use client";

import { useState, useRef, ChangeEvent, KeyboardEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

import { Heading } from "@/components/heading";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
// Note: We are opting for native div scrolling for better mobile behavior, 
// but keeping the import if you use it elsewhere.
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Paperclip, AlertCircle, SendHorizontal, X, Plus, ArrowDown, Github } from "lucide-react";
import { GitHubConsentModal } from "@/components/github-consent-modal";
import { ShareIconButton } from "@/components/share-button";
import { cn } from "@/lib/utils";
import EmptyState from "@/components/empty";
import { ChatBubbleIcon, PersonIcon } from "@radix-ui/react-icons";
import { submitFeedback } from "@/lib/feedback/submitFeedback";
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
// Removed manual compression - relying on native HTTP compression (Brotli/Gzip)

// Message structure
interface Message {
  text: string;
  role: "user" | "bot";
  timestamp: Date;
}

// Selected file structure
interface SelectedFile {
  file: File;
  preview: string;
  name: string;
  type: string;
  base64Data?: string;
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
}

const SafeChart = ({ data }: { data: ChartDataPoint[] }) => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div className="my-6 w-full overflow-hidden rounded-lg border bg-card p-4 shadow-sm">
      <div className="overflow-x-hidden w-full" style={{ minHeight: '300px' }}>
        <ResponsiveContainer width="100%" height={300}>
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
  try {
    const table = node;
    const headers = table.children?.[0]?.children?.map((th: any) => th.children?.[0]?.value) || [];
    const rows = table.children?.slice(1)?.map((tr: any) =>
      tr.children?.map((td: any) => td.children?.[0]?.value)
    ) || [];

    if (headers.length === 2 && rows.length > 0 && !isNaN(parseFloat(rows[0][1]))) {
      const data = rows.map((row: any) => ({ name: row[0], value: parseFloat(row[1]) }));
      return <SafeChart data={data} />;
    }
  } catch (e) {
    console.error("Error parsing/rendering chart:", e);
  }

  return (
    <div className="my-4 w-full overflow-y-auto">
      <table className="w-full" {...props}>
        {props.children}
      </table>
    </div>
  );
};

// Main Page Component
export default function ConversationPage({ params }: { params: { id: string } }) {
  const conversationId = params.id;
  const { messages: supabaseMessages } = useSupabaseChat(conversationId);
  // We keep local 'messages' state for optimistic updates, but sync with Supabase
  const [messages, setMessages] = useState<Message[]>([]);

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
  const [error, setError] = useState<string | null>(null);
  const [showGreeting, setShowGreeting] = useState(true);
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [sessionId, setSessionId] = useState("");
  const [sessionRestored, setSessionRestored] = useState(false);
  const [deviceId, setDeviceId] = useState("");
  const [multiDeviceStatus, setMultiDeviceStatus] = useState<any>(null);
  const [userId, setUserId] = useState("");
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [memoryCount, setMemoryCount] = useState<number>(0);
  const [isMemoryPulsing, setIsMemoryPulsing] = useState(false);

  // GitHub Consent State
  const [isGitHubModalOpen, setIsGitHubModalOpen] = useState(false);
  const [gitHubAction, setGitHubAction] = useState<any>(null);

  const handleGitHubConnect = () => {
    window.location.href = "/api/integrations/github/auth"; // Trigger OAuth
  };

  const handleGitHubActionConfirm = async () => {
    // Execute logic here calling /api/integrations/github/execute
    console.log("Executing GitHub action:", gitHubAction);
    setIsGitHubModalOpen(false);

    // Mock execution for UI demo
    const botMessage: Message = { text: `✅ Successfully executed GitHub Action: ${gitHubAction?.type} on ${gitHubAction?.repo}`, role: "bot", timestamp: new Date() };
    setMessages((prev) => [...prev, botMessage]);
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

  // ---------------------------------------------------------------

  const handleSendMessage = async () => {
    const trimmedInput = userInput.trim();
    if (!trimmedInput && !selectedFile) return;
    setLoading(true); setError(null); setShowGreeting(false);

    let messageText = trimmedInput;
    if (selectedFile) { messageText += `\n\n[Attached File: ${selectedFile.name} (${selectedFile.type})]`; }

    const userMessage: Message = { text: messageText, role: "user", timestamp: new Date() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages); setUserInput(""); setSelectedFile(null);

    try {
      // Dispatcher Call (Fire and Forget - 200 OK)
      await axios.post("/api/chat", {
        conversationId,
        userId,
        prompt: messageText,
        fileData: selectedFile ? {
          name: selectedFile.name,
          type: selectedFile.type,
          base64Data: selectedFile.base64Data
        } : undefined
      });
    } catch (error: any) {
      console.error("Error sending message:", error);
      if (error.response?.status === 401) {
        window.location.href = "/sign-in?redirect_url=" + encodeURIComponent(window.location.pathname);
        return;
      }
      setError(error.response?.data?.details || "Sorry, something went wrong.");
    } finally { setLoading(false); }
  };

  const handleAttachClick = () => { fileInputRef.current?.click(); };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const objectUrl = URL.createObjectURL(file);
      const base64 = await readFileAsBase64(file);
      setSelectedFile({
        file,
        preview: objectUrl,
        name: file.name,
        type: file.type,
        base64Data: base64
      });
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
    return (
      <div className="flex items-center space-x-3 mb-6 animate-in fade-in duration-300">
        <Avatar className="h-8 w-8 ring-1 ring-border/50">
          <AvatarImage src="/Genie.png" />
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
    <div className="flex flex-col h-[100dvh] bg-background text-foreground relative overflow-hidden">

      {/* Header - Compact and pinned top */}
      <header className="flex-none px-4 py-3 border-b border-border/40 bg-background/80 backdrop-blur-md z-20 flex items-center justify-between sticky top-0">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-sky-500/10 flex items-center justify-center">
            <ChatBubbleIcon className="h-4 w-4 text-sky-600 dark:text-sky-400" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">Genie</h1>
            <div className="flex items-center gap-2">
              {/* Memory Counter */}
              <div className={cn("text-[10px] text-muted-foreground transition-all duration-300 flex items-center gap-1", isMemoryPulsing && "text-indigo-500 font-bold scale-105")}>
                <span className={cn("w-1.5 h-1.5 rounded-full bg-indigo-500", isMemoryPulsing && "animate-ping")} />
                {memoryCount} memories
              </div>

              {multiDeviceStatus?.isMultiDevice && (
                <div className="text-[10px] text-green-600 flex items-center gap-1 border-l border-border/50 pl-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  Sync active
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Indicators and Actions */}
        <div className="flex gap-2 items-center">
          {/* New Chat Button */}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1 hidden sm:flex"
            onClick={async () => {
              const newConv = await createNewConversation();
              if (newConv) {
                clearSessionMemoryStorage(conversationId); // Clear current chat only
                // Navigate to new conversation URL
                window.location.href = `/conversation/${newConv.id}`;
              }
            }}
          >
            <Plus className="h-3 w-3" />
            New Chat
          </Button>

          {/* GitHub Connect Button */}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={handleGitHubConnect}
            title="Connect GitHub"
          >
            <Github className="h-4 w-4" />
          </Button>
          {sessionRestored && messages.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
              <AlertCircle className="h-3 w-3" />
              {messages.length} msgs
            </div>
          )}
        </div>
      </header>

      {/* Main Chat Area - Flex grow with native scroll for better mobile feel */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden w-full scroll-smooth">
        <div className="max-w-3xl mx-auto w-full px-4 py-6 md:px-6 min-h-0">

          {/* Greeting */}
          {showGreeting && (
            <div className="flex flex-col items-center justify-center min-h-[40vh] text-center space-y-4 animate-in fade-in zoom-in duration-500">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-sky-500 flex items-center justify-center shadow-lg shadow-indigo-500/20">
                <ChatBubbleIcon className="h-8 w-8 text-white" />
              </div>
              <div className="space-y-2 max-w-sm">
                <h2 className="text-xl font-semibold tracking-tight">Welcome back</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {GREETING_MESSAGE}
                </p>
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
                      <AvatarImage src="/Genie.png" />
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
                  "relative text-sm md:text-base leading-relaxed break-words",
                  msg.role === "user"
                    ? "bg-secondary text-secondary-foreground rounded-[20px] rounded-tr-sm px-4 py-3 md:px-5 md:py-4 shadow-sm" // Claude-style user bubble
                    : "bg-transparent text-foreground px-0 py-0" // Gemini/Claude-style bot (no bubble)
                )}>
                  {msg.role === "bot" ? (
                    <>
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
                        {msg.text}
                      </ReactMarkdown>

                      {/* Action Bar (Copy/Share + Feedback) - fades in */}
                      <div className="mt-2 flex gap-2 items-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <ShareIconButton
                          content={{
                            title: "Genie AI Response",
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
                                  model: "gemini-2.0-flash",
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
                                  model: "gemini-2.0-flash",
                                })
                              }
                            >
                              👎
                            </button>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  )}
                </div>
              </div>
            </div>
          ))}

          {loading && <TypingIndicator />}

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
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-28 right-6 z-30 h-10 w-10 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg flex items-center justify-center transition-all duration-200 animate-in fade-in slide-in-from-bottom-2"
          aria-label="Scroll to bottom"
        >
          <ArrowDown className="h-5 w-5" />
        </button>
      )}

      {/* Input Area - Floating & Glassmorphism */}
      <div className="flex-none w-full p-4 bg-gradient-to-t from-background via-background to-transparent pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="max-w-3xl mx-auto relative">
          {/* File Preview Pill */}
          {selectedFile && (
            <div className="absolute -top-10 left-0 animate-in slide-in-from-bottom-2 fade-in">
              <div className="flex items-center gap-2 bg-background border border-border shadow-sm px-3 py-1.5 rounded-full text-xs font-medium text-foreground">
                <Paperclip className="h-3 w-3 text-indigo-500" />
                <span className="max-w-[150px] truncate">{selectedFile.name}</span>
                <button
                  onClick={() => {
                    setSelectedFile(null);
                    if (selectedFile.preview) {
                      URL.revokeObjectURL(selectedFile.preview); // Clean up object URL
                    }
                  }}
                  className="text-muted-foreground hover:text-destructive transition-colors ml-1"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            </div>
          )}

          {/* Input Container */}
          <div className="relative flex items-end gap-2 bg-muted/40 hover:bg-muted/60 focus-within:bg-background focus-within:ring-2 focus-within:ring-indigo-500/20 border border-border/50 rounded-[26px] p-2 transition-all duration-200 shadow-sm">
            <input type="file" ref={fileInputRef} onChange={handleFileChange} style={{ display: 'none' }} />

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={loading}
              className="h-10 w-10 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 shrink-0"
            >
              <Paperclip className="h-5 w-5" />
            </Button>

            <Textarea
              rows={1}
              placeholder="Message Genie..."
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={handleKeyPress}
              disabled={loading}
              className="flex-1 min-h-[44px] max-h-32 py-3 bg-transparent border-0 focus-visible:ring-0 resize-none text-base leading-relaxed placeholder:text-muted-foreground/70"
            />

            <Button
              onClick={handleSendMessage}
              disabled={loading || (!userInput.trim() && !selectedFile)}
              size="icon"
              className={cn(
                "h-10 w-10 rounded-full shrink-0 transition-all duration-200",
                (userInput.trim() || selectedFile)
                  ? "bg-indigo-600 hover:bg-indigo-700 text-white shadow-md transform active:scale-95"
                  : "bg-transparent text-muted-foreground hover:bg-muted/50"
              )}
            >
              <SendHorizontal className="h-5 w-5" />
            </Button>
          </div>

          <div className="text-center mt-2">
            <p className="text-[10px] text-muted-foreground/60 font-medium">
              Genie can make mistakes. Check important info.
            </p>
          </div>
        </div>
      </div>

      {/* Consent Modal */}
      <GitHubConsentModal
        isOpen={isGitHubModalOpen}
        onClose={() => setIsGitHubModalOpen(false)}
        onConfirm={handleGitHubActionConfirm}
        action={gitHubAction || { type: 'commit', repo: 'unknown', description: 'No action pending' }}
      />
    </div>
  );
}