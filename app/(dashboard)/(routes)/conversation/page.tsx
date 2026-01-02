"use client";

import { useState, useRef, ChangeEvent, KeyboardEvent, useEffect } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

import { Heading } from "@/components/heading";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Paperclip, AlertCircle } from "lucide-react";
import { ShareIconButton } from "@/components/share-button";
import { cn } from "@/lib/utils";
import EmptyState from "@/components/empty";
import { ChatBubbleIcon, PersonIcon } from "@radix-ui/react-icons";
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

// Message structure
interface Message {
  text: string;
  role: "user" | "bot";
  timestamp: Date;
}

// Selected file structure
interface SelectedFile {
  name: string;
  type: string;
}

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

      // Render chart inside a div that allows horizontal scrolling if needed
      return (
        <div className="my-4 overflow-x-auto" style={{ width: '100%', minWidth: '250px', height: 300 }}>
          <ResponsiveContainer width="100%" height="100%">
            {data.length <= 5 ? (
              <PieChart>
                <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} fill="#8884d8" label>
                  {data.map((entry: any, index: number) => <Cell key={`cell-${index}`} fill={['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8'][index % 5]} />)}
                </Pie>
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
              </PieChart>
            ) : (
              <BarChart data={data} margin={{ top: 5, right: 5, left: 5, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" angle={-30} textAnchor="end" height={50} interval={0} fontSize={10} />
                <YAxis fontSize={10} />
                <Tooltip wrapperStyle={{ fontSize: '12px' }} />
                <Legend wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="value" fill="#8884d8" />
              </BarChart>
            )}
          </ResponsiveContainer>
        </div>
      );
    }
  } catch (e) { console.error("Error parsing/rendering chart:", e); }
  // ✅ Fallback within RenderTableAsChart includes overflow styling
  return <div className="overflow-x-auto"><table {...props} className="markdown-table border-collapse border border-border my-4 text-sm w-full" /></div>;
};

// Main Page Component
export default function ConversationPage() {
  const [messages, setMessages] = useState<Message[]>([]);
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionCleanup = useSessionCleanup();
  const syncIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const GREETING_MESSAGE = "Hi there! How can I assist you today? Feel free to ask me anything or attach a file for insights.";

  // ✅ Load session memory on mount + initialize device sync
  useEffect(() => {
    const initializeSession = async () => {
      try {
        // Get or create session ID
        const sid = getOrCreateSessionId();
        setSessionId(sid);

        // Get device info
        const did = getOrCreateDeviceId();
        setDeviceId(did);
        console.log('[DeviceSync] Initialized device:', getDeviceName(getDeviceInfo()));

        // Restore messages from storage
        const savedMessages = getSessionMemoryFromStorage();
        if (savedMessages.length > 0) {
          const restoredMessages: Message[] = savedMessages.map(msg => ({
            text: msg.text,
            role: msg.role,
            timestamp: new Date(msg.timestamp),
          }));

          setMessages(restoredMessages);
          setShowGreeting(false);

          const stats = getMemoryStats();
          console.log('[SessionMemory] Restored conversation:', {
            messages: stats.totalMessages,
            userMessages: stats.userMessages,
            botMessages: stats.botMessages,
            sessionAge: `${stats.sessionAgeMinutes}m ago`,
            storageSize: stats.storageSize,
          });
        } else {
          console.log('[SessionMemory] No previous session found - starting fresh');
        }

        // Get user ID from Clerk (via API call since we can't use useAuth here directly)
        try {
          const response = await fetch('/api/auth/user');
          if (response.ok) {
            const data = await response.json();
            setUserId(data.userId);

            // Register device sync session
            registerSyncSession(data.userId, savedMessages.length);

            // Check for multi-device login
            const status = detectMultiDeviceLogin(data.userId);
            setMultiDeviceStatus(status);

            if (status.isMultiDevice) {
              console.log('[DeviceSync] Multi-device detected:', {
                deviceCount: status.deviceCount,
                devices: status.devices.map(d => d.deviceId.substring(0, 12)),
              });
            }
          }
        } catch (err) {
          console.warn('[DeviceSync] Could not fetch user info:', err);
        }

        setSessionRestored(true);
      } catch (err) {
        console.error('[SessionMemory] Failed to initialize session:', err);
        setSessionRestored(true);
      }
    };

    initializeSession();
  }, []);

  // ✅ Save to cookie whenever messages change + track device activity
  useEffect(() => {
    if (sessionRestored && sessionId && messages.length > 0) {
      const sessionMessages: SessionMessage[] = messages.map(msg => ({
        text: msg.text,
        role: msg.role,
        timestamp: msg.timestamp.getTime(),
      }));

      saveSessionMemoryToStorage(sessionMessages, 'current-user', sessionId);

      // Track message sent for device sync
      if (deviceId) {
        trackMessageSent(messages.length);
      }
    }
  }, [messages, sessionRestored, sessionId, deviceId]);

  // ✅ Setup periodic sync to cloud every 5 minutes
  useEffect(() => {
    if (!sessionRestored || !userId || !deviceId || messages.length === 0) return;

    const syncToCloud = async () => {
      try {
        const messagesToSync = messages.map(msg => ({
          text: msg.text,
          role: msg.role,
          timestamp: msg.timestamp.getTime(),
        }));

        const syncMessages = toSyncMessages(messagesToSync, deviceId);

        const response = await axios.post('/api/sync/conversation', {
          deviceId,
          messages: syncMessages,
          isNewDevice: false,
          lastSyncTimestamp: Date.now(),
        });

        if (response.data.merged) {
          // Merge cloud messages with local
          const mergedMessages: Message[] = response.data.merged.map((m: any) => ({
            text: m.text,
            role: m.role,
            timestamp: new Date(m.timestamp),
          }));

          // Update if merged version has more messages
          if (mergedMessages.length > messages.length) {
            setMessages(mergedMessages);
            saveSessionMemoryToStorage(
              mergedMessages.map(msg => ({
                text: msg.text,
                role: msg.role,
                timestamp: msg.timestamp.getTime(),
              })),
              'current-user',
              sessionId
            );
          }

          // Update multi-device status
          if (response.data.deviceCount > 1) {
            setMultiDeviceStatus({
              isMultiDevice: true,
              deviceCount: response.data.deviceCount,
            });
          }

          console.log('[DeviceSync] Cloud sync successful:', {
            synced: response.data.messagesSynced,
            merged: response.data.totalMerged,
            devices: response.data.deviceCount,
          });
        }
      } catch (err: any) {
        if (err.response?.status === 401) {
          console.warn('[DeviceSync] Unauthorized during sync - session likely expired');
          // Optional: Redirect or just stop syncing to avoid spamming console
          // window.location.href = "/sign-in"; 
          // For sync, maybe just log it since it runs in background
        }
        console.warn('[DeviceSync] Cloud sync failed (will retry):', err);
      }
    };

    // Initial sync after 10 seconds
    const initialTimeout = setTimeout(syncToCloud, 10000);

    // Then periodic sync every 5 minutes
    const syncInterval = setInterval(syncToCloud, 5 * 60 * 1000);
    syncIntervalRef.current = syncInterval;

    return () => {
      clearTimeout(initialTimeout);
      clearInterval(syncInterval);
    };
  }, [sessionRestored, userId, deviceId, messages, sessionId]);

  const handleSendMessage = async () => { /* ... (keep existing logic) ... */
    const trimmedInput = userInput.trim();
    if (!trimmedInput && !selectedFile) return;
    setLoading(true); setError(null); setShowGreeting(false);
    let messageText = trimmedInput;
    if (selectedFile) { messageText += `\n\n[Attached File: ${selectedFile.name} (${selectedFile.type})]`; }
    const userMessage: Message = { text: messageText, role: "user", timestamp: new Date() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages); setUserInput(""); setSelectedFile(null);
    try {
      const response = await axios.post("/api/conversation", { messages: newMessages.map(msg => ({ role: msg.role, text: msg.text })) });
      const botMessage: Message = { text: response.data.text, role: "bot", timestamp: new Date() };
      setMessages((prevMessages) => [...prevMessages, botMessage]);
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
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => { /* ... (keep existing logic) ... */
    const file = event.target.files?.[0];
    if (file) { setSelectedFile({ name: file.name, type: file.type || 'unknown' }); }
    if (fileInputRef.current) { fileInputRef.current.value = ""; }
  };
  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } };
  const TypingIndicator = () => { /* ... (keep existing logic) ... */
    return (<div className="flex items-center space-x-2 p-2"><Avatar className="h-8 w-8"><AvatarImage src="/Genie.png" alt="Genie Avatar" /><AvatarFallback>G</AvatarFallback></Avatar><div className="flex items-center space-x-1.5 p-2 rounded-lg bg-muted"><div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse"></div><div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse [animation-delay:0.2s]"></div><div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse [animation-delay:0.4s]"></div></div></div>);
  };

  return (
    <div className="h-[calc(100dvh-5rem)] md:h-full flex flex-col">
      <div className="px-4 py-2">
        <Heading
          title="Genie Conversation"
          description="Chat with Genie or upload a file for insights."
          icon={ChatBubbleIcon}
          iconColor="text-sky-500"
          bgColor="bg-sky-500/10"
        />

        {/* ✅ Session Memory Indicator */}
        <div className="flex flex-wrap gap-2 mt-2">
          {sessionRestored && messages.length > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-xs text-blue-700 dark:text-blue-300">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>
                Memory: <strong>{messages.length}</strong> msgs
              </span>
            </div>
          )}

          {/* ✅ Multi-Device Sync Indicator */}
          {multiDeviceStatus?.isMultiDevice && (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-xs text-green-700 dark:text-green-300">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>
                Sync: <strong>{multiDeviceStatus.deviceCount}</strong> devices
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="flex-grow flex flex-col md:px-8 overflow-hidden">
        <ScrollArea className="flex-1 p-0 md:p-4 rounded-md border-0 md:border bg-background/50 backdrop-blur-sm shadow-sm md:shadow-sm">
          <div className="max-w-3xl mx-auto px-3 md:px-0">
            {showGreeting && (
              <div className="flex items-start space-x-2 md:space-x-3 mb-8 mt-4">
                <Avatar className="h-8 w-8 mt-1"><AvatarImage src="/Genie.png" alt="Genie Avatar" /><AvatarFallback>G</AvatarFallback></Avatar>
                <div className="p-4 rounded-2xl bg-muted/50 text-sm leading-relaxed border border-border/50 max-w-full">
                  {GREETING_MESSAGE}
                </div>
              </div>
            )}
            {messages.map((msg, index) => (
              <div key={index} className={cn("mb-8 flex gap-2 md:gap-3 group",
                msg.role === "user" ? "flex-col-reverse md:flex-row items-end justify-end" : "flex-col md:flex-row items-start justify-start")}>
                {msg.role === "bot" && (<Avatar className="h-8 w-8 md:mt-1 flex-shrink-0"><AvatarImage src="/Genie.png" alt="Genie Avatar" /><AvatarFallback>G</AvatarFallback></Avatar>)}
                <div className={cn("max-w-[98%] md:max-w-[80%] rounded-2xl shadow-sm p-3 md:p-4 text-sm break-words relative leading-relaxed",
                  msg.role === "user" ? "bg-primary text-primary-foreground rounded-tr-none md:rounded-tr-none rounded-br-none md:rounded-br-xl" : "bg-muted/80 dark:bg-muted/40 backdrop-blur-sm rounded-tl-none md:rounded-tl-none rounded-bl-none md:rounded-bl-xl border border-border/50")}>
                  {msg.role === "bot" ? (
                    <>
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          // ✅ ONLY ONE 'table' definition, pointing to our component
                          table: RenderTableAsChart,
                          // Standard markdown element styling
                          pre: ({ node, ...props }) => <div className="relative w-full overflow-hidden my-3 rounded-lg border bg-zinc-950/90 dark:bg-zinc-900/90"><pre {...props} className="p-3 overflow-x-auto text-xs text-zinc-50" /></div>,
                          code({ node, className, children, ...props }) {
                            const match = /language-(\w+)/.exec(className || '');
                            return match ? (
                              <div className="relative"> {/* Placeholder for CodeBlock */}
                                <code className={className} {...props}>{children}</code>
                              </div>
                            ) : (<code className={cn("bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded font-mono text-xs", className)} {...props}>{children}</code>);
                          },
                          p: ({ node, ...props }) => <p {...props} className="mb-2 last:mb-0" />,
                          ul: ({ node, ...props }) => <ul {...props} className="list-disc list-inside mb-2 pl-2 space-y-1" />,
                          ol: ({ node, ...props }) => <ol {...props} className="list-decimal list-inside mb-2 pl-2 space-y-1" />,
                          li: ({ node, ...props }) => <li {...props} className="pl-1" />,
                          blockquote: ({ node, ...props }) => <blockquote {...props} className="border-l-4 border-primary/30 pl-4 py-1 italic text-muted-foreground my-2 bg-muted/30 rounded-r" />,
                          a: ({ node, ...props }) => <a {...props} className="text-primary underline underline-offset-4 hover:text-primary/80 transition-colors" target="_blank" rel="noreferrer" />,
                        }}
                      >
                        {msg.text}
                      </ReactMarkdown>
                      {/* Share button - appears on hover */}
                      <div className="absolute -bottom-6 left-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                        <ShareIconButton
                          content={{
                            title: "Genie AI Response",
                            text: msg.text.length > 280 ? msg.text.substring(0, 277) + "..." : msg.text,
                            url: typeof window !== "undefined" ? window.location.href : undefined,
                          }}
                          className="h-6 w-6 bg-background shadow-sm border"
                        />
                      </div>
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.text}</p>
                  )}
                </div>
                {msg.role === "user" && (<Avatar className="hidden md:flex h-8 w-8 md:mt-1 flex-shrink-0"><AvatarFallback><PersonIcon /></AvatarFallback></Avatar>)}
              </div>
            ))}
            {loading && <TypingIndicator />}
            <div className="h-4" /> {/* Spacer */}
          </div>
        </ScrollArea>

        {error && <div className="p-2 text-center"><p className="text-destructive text-sm bg-destructive/10 py-1 px-3 rounded-full inline-block">{error}</p></div>}

        <div className="p-2 pt-0 md:p-4 max-w-3xl mx-auto w-full">
          <div className="flex items-end gap-2 p-2 rounded-xl border bg-background shadow-xs focus-within:ring-1 focus-within:ring-ring transition-all">
            <Button variant="ghost" size="icon" onClick={handleAttachClick} disabled={loading} aria-label="Attach file" className="h-9 w-9 text-muted-foreground hover:text-primary shrink-0">
              <Paperclip className="h-5 w-5" />
            </Button>
            <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />

            <div className="flex-1 min-w-0 flex flex-col justify-center">
              {selectedFile && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md mb-1 w-fit max-w-full">
                  <span className="truncate max-w-[150px]">{selectedFile.name}</span>
                  <button onClick={() => setSelectedFile(null)} className="hover:text-destructive">×</button>
                </div>
              )}
              <Textarea
                rows={1}
                placeholder="Ask me anything..."
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={handleKeyPress}
                disabled={loading}
                className="min-h-[24px] max-h-40 border-0 focus-visible:ring-0 resize-none p-0 bg-transparent text-sm leading-relaxed"
              />
            </div>

            <Button onClick={handleSendMessage} disabled={loading || (!userInput.trim() && !selectedFile)} size="icon" aria-label="Send message" className="h-9 w-9 shrink-0 shadow-none transition-transform active:scale-95">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" /></svg>
            </Button>
          </div>
          <div className="text-[10px] text-muted-foreground text-center mt-2 hidden md:block">
            AI can make mistakes. Consider checking important information.
          </div>
        </div>
      </div>
    </div>
  );
}