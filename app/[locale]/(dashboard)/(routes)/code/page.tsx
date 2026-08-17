"use client";

import { useState, useRef, ChangeEvent, KeyboardEvent, useEffect } from "react";
import { safeLocalStorage } from "@/lib/safeStorage";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useClipboard } from "use-clipboard-copy";



import { KoFiNudge } from "@/components/kofi-nudge";
import { useSupportNudge } from "@/hooks/use-support-nudge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Paperclip, AlertCircle, SendHorizontal, X, Copy, Check, ArrowDown, Github } from "lucide-react";
import { CodeIcon } from "@radix-ui/react-icons";
import { cn } from "@/lib/utils";
import { PersonIcon } from "@radix-ui/react-icons";
import { ShareIconButton } from "@/components/share-button";
import { GitHubRepoModal } from "@/components/github-repo-modal";
import { GitHubConsentModal } from "@/components/github-consent-modal";

// ... (keep existing imports)

import { CodeModelProvider, useCodeModel } from "@/contexts/CodeModelContext";
import { CodeModelToggle } from "@/components/chat/CodeModelToggle";
import { CODE_MODELS, ProviderKeyState } from "@/lib/llm/codeModels";
import {
  getSessionMemoryFromStorage,
  saveSessionMemoryToStorage,
  SessionMessage
} from "@/lib/sessionClientMemory";
import { createNewConversation } from "@/lib/conversationManager";

// ... (keep existing imports)

// Content Component (Inner)

interface CodeContext {
  workspaceId: string | null;
  workspaceName: string | null;
  operatingProfileId: string | null;
  operatingProfileName: string | null;
  operatingProfileMode: string | null;
}

interface SelectedFile {
  name: string;
  type: string;
  base64Data: string;
}

interface Message {
  id?: string;
  role: "user" | "bot";
  text: string;
  timestamp: Date;
  fileData?: SelectedFile;
}

const CodeBlock = ({ codeString, language }: { codeString: string, language: string }) => {
  const clipboard = useClipboard({
    copiedTimeout: 2000,
  });

  return (
    <div className="relative group rounded-md overflow-hidden my-2 border border-border/50">
      <div className="flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border/50">
        <span className="text-xs font-mono text-muted-foreground uppercase">{language}</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => clipboard.copy(codeString)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {clipboard.copied ? (
              <>
                <Check className="h-3 w-3" />
                Copied
              </>
            ) : (
              <>
                <Copy className="h-3 w-3" />
                Copy
              </>
            )}
          </button>
        </div>
      </div>
      <SyntaxHighlighter
        language={language}
        style={vscDarkPlus}
        customStyle={{ margin: 0, padding: '1rem', fontSize: '0.875rem', lineHeight: '1.5' }}
        wrapLines={true}
        showLineNumbers={true}
        lineNumberStyle={{ minWidth: "2.5em", paddingRight: "1em", color: "#6b7280" }}
      >
        {codeString}
      </SyntaxHighlighter>
    </div>
  );
};

const codeConversationRowKey = (workspaceId?: string | null, operatingProfileId?: string | null) => 
  `weaver_code_conversation_id:${workspaceId || "global"}:${operatingProfileId || "global"}`;

const getLocalCodeSessionId = (workspaceId?: string | null, operatingProfileId?: string | null) => 
  `local-code-session:${workspaceId || "global"}:${operatingProfileId || "global"}`;

function CodePageContent() {
  const { codeModel, setCodeModel, providerKeyState, setProviderKeyState } = useCodeModel();

  // OpenRouter visibility: refresh configured-provider state from settings API.
  useEffect(() => {
    async function loadProviderKeyState() {
      try {
        const res = await fetch('/api/settings/keys');
        if (!res.ok) return;
        const data = await res.json();
        const next: ProviderKeyState = {};
        for (const [provider, info] of Object.entries(data.providers || {})) {
          const entry = info as { configured?: boolean } | undefined;
          if (entry?.configured) next[provider] = { configured: true };
        }
        setProviderKeyState(next);
      } catch (e) {
        console.error('[PROVIDER_KEY_STATE_LOAD]', e);
      }
    }

    loadProviderKeyState();
  }, [setProviderKeyState]);

  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [codeContext, setCodeContext] = useState<CodeContext>({ workspaceId: null, workspaceName: null, operatingProfileId: null, operatingProfileName: null, operatingProfileMode: null });
  const [userInput, setUserInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGreeting, setShowGreeting] = useState(true);
  const [selectedFile, setSelectedFile] = useState<SelectedFile | null>(null);
  const [saveToMemory, setSaveToMemory] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null); // Chat container for scroll
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [memoryCount, setMemoryCount] = useState<number>(0);
  const [isMemoryPulsing, setIsMemoryPulsing] = useState(false);

  // GitHub State
  const [activeRepo, setActiveRepo] = useState<string | null>(null);
  const [isRepoModalOpen, setIsRepoModalOpen] = useState(false);
  const [linkedRepos, setLinkedRepos] = useState<string[]>([]);

  // Hydrate repo context from workspace-linked repos once code context is available.
  useEffect(() => {
    let cancelled = false;
    async function loadLinkedRepos() {
      const workspaceId = codeContext.workspaceId;
      if (!workspaceId) return;
      try {
        const res = await fetch(`/api/workspaces/${workspaceId}/repos`);
        if (!res.ok) return;
        const data = await res.json();
        const repos: string[] = Array.isArray(data.repos) ? data.repos : [];
        if (cancelled) return;
        setLinkedRepos(repos);
        const savedActive = typeof data.active_github_repo === 'string' ? data.active_github_repo : null;
        // If the saved active repo is still linked, use it; otherwise fall back to first linked repo.
        const hydrated = savedActive && repos.includes(savedActive) ? savedActive : repos[0] || null;
        setActiveRepo(hydrated);
      } catch (err) {
        console.error('[CodePage] Failed to fetch workspace repos:', err);
      }
    }
    loadLinkedRepos();
    return () => { cancelled = true; };
  }, [codeContext.workspaceId]);

  // GitHub Consent State (for Actions - separate from Context)
  const [isGitHubModalOpen, setIsGitHubModalOpen] = useState(false);
  const [gitHubAction, setGitHubAction] = useState<any>(null);

  const handleGitHubClick = () => {
    setIsRepoModalOpen(true);
  };

  const handleRepoIndexComplete = async (repoInfo: { owner: string; repo: string; fileCount: number }) => {
    const fullName = `${repoInfo.owner}/${repoInfo.repo}`;
    setActiveRepo(fullName);
    setIsRepoModalOpen(false);

    // Persist this repo as the workspace's active GitHub repo so it survives
    // across page reloads and is shared with Settings.
    try {
      const workspaceId = codeContext.workspaceId;
      if (workspaceId) {
        await fetch(`/api/workspaces/${workspaceId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ active_github_repo: fullName }),
        });
      }
    } catch (err) {
      console.error('[CodePage] Failed to persist active repo:', err);
    }

    // Add a system message to confirm context is loaded
    const botMessage: Message = {
      text: `📚 **Repository Linked:** \`${fullName}\`\nI have indexed ${repoInfo.fileCount} code files from this repository. You can now ask questions about the codebase!`,
      role: "bot",
      timestamp: new Date()
    };
    setMessages((prev) => [...prev, botMessage]);
    setShowGreeting(false);
  };

  const handleGitHubActionConfirm = async () => {
    console.log("Executing GitHub action:", gitHubAction);
    setIsGitHubModalOpen(false);
    // Mock execution for UI demo
    const botMessage: Message = { text: `✅ Successfully executed GitHub Action: ${gitHubAction?.type} on ${gitHubAction?.repo}`, role: "bot", timestamp: new Date() };
    setMessages((prev) => [...prev, botMessage]);
  };

  const GREETING_MESSAGE = "Ask me a coding question, debug code, or attach a file for analysis.";

  // ... (keep existing scroll and effect logic)

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

  useEffect(() => {
    const loadCodeContext = async () => {
      try {
        const [workspaceRes, profileRes] = await Promise.all([
          axios.get('/api/workspaces/default'),
          axios.get('/api/operating-profiles/default'),
        ]);

        const workspace = workspaceRes.data?.workspace ?? null;
        const profile = profileRes.data?.operatingProfile ?? null;

        setCodeContext({
          workspaceId: workspace?.id ?? null,
          workspaceName: workspace?.name ?? null,
          operatingProfileId: profile?.id ?? workspace?.default_operating_profile_id ?? null,
          operatingProfileName: profile?.name ?? null,
          operatingProfileMode: profile?.mode ?? null,
        });
      } catch (err) {
        console.error('[CODE_CONTEXT_LOAD_ERROR]', err);
      }
    };

    loadCodeContext();
  }, []);

  // Persistence for Code Session

  useEffect(() => {
    const bootstrapCodeConversation = async () => {
      try {
        const conversationRowKey = codeConversationRowKey(codeContext.workspaceId, codeContext.operatingProfileId);
        let resolvedConversationId = safeLocalStorage.getItem(conversationRowKey);

        if (!resolvedConversationId && codeContext.workspaceId) {
          const created = await createNewConversation({
            title: codeContext.workspaceName ? `${codeContext.workspaceName} Code` : 'Code Conversation',
            workspaceId: codeContext.workspaceId ?? undefined,
            operatingProfileId: codeContext.operatingProfileId ?? undefined,
          });

          if (created?.id) {
            resolvedConversationId = created.id;
            safeLocalStorage.setItem(conversationRowKey, created.id);
          }
        }

        if (resolvedConversationId) {
          setConversationId(resolvedConversationId);
          const response = await fetch(`/api/conversations/${resolvedConversationId}`, { credentials: 'include' });
          if (response.ok) {
            const data = await response.json();
            const restoredMessages: Message[] = (data.messages || []).map((msg: any) => ({
              id: msg.id,
              text: msg.text,
              role: msg.role,
              timestamp: new Date(msg.timestamp),
              fileData: msg.fileData,
            }));
            
            // Authoritative rule: Row-backed history wins.
            setMessages(restoredMessages);
            if (restoredMessages.length > 0) {
              setShowGreeting(false);
            }
            return;
          }
        }

        // Only fall back to local storage if we absolutely could not establish or fetch a conversation
        const localSessionId = getLocalCodeSessionId(codeContext.workspaceId, codeContext.operatingProfileId);
        const savedMessages = getSessionMemoryFromStorage(localSessionId);
        if (savedMessages.length > 0) {
          const restoredMessages: Message[] = savedMessages.map(msg => ({
            text: msg.text,
            role: msg.role,
            timestamp: new Date(msg.timestamp),
            fileData: msg.fileData
          }));
          setMessages(restoredMessages);
          setShowGreeting(false);
        }
      } catch (err) {
        console.error('[CODE_CONVERSATION_BOOTSTRAP_ERROR]', err);
      }
    };

    if (codeContext.workspaceId || codeContext.operatingProfileId) {
      bootstrapCodeConversation();
    }
  }, [codeContext.workspaceId, codeContext.operatingProfileId, codeContext.workspaceName]);

  // Save to storage on change
  useEffect(() => {
    if (messages.length > 0) {
      const sessionMessages: SessionMessage[] = messages.map(msg => ({
        text: msg.text,
        role: msg.role,
        timestamp: msg.timestamp.getTime(),
        fileData: msg.fileData
      }));
      const localSessionId = getLocalCodeSessionId(codeContext.workspaceId, codeContext.operatingProfileId);
      saveSessionMemoryToStorage(sessionMessages, 'current-user', 'code-session', localSessionId);
    }
  }, [messages, codeContext.workspaceId, codeContext.operatingProfileId]);

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


  // Initial memory-count load on mount — a data-fetch effect.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchMemoryCount();
  }, []);

  // Trigger fetch on new message (bot response)
  useEffect(() => {
    if (messages.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchMemoryCount();
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsMemoryPulsing(true);
      const timer = setTimeout(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setIsMemoryPulsing(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [messages.length]);

  // Helper function to read file as Base64
  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64String = (reader.result as string).split(',')[1];
        resolve(base64String);
      };
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  };

  // Handle sending message
  const handleSendMessage = async () => {
    const trimmedInput = userInput.trim();
    if (!trimmedInput && !selectedFile) return;

    setLoading(true);
    setError(null);
    setShowGreeting(false);

    let messageText = trimmedInput;
    if (selectedFile) {
      messageText += `\n\n[Analysing File: ${selectedFile.name}]`;
    }

    const userMessage: Message = {
      text: messageText,
      role: "user",
      timestamp: new Date(),
      fileData: selectedFile ? {
        name: selectedFile.name,
        type: selectedFile.type,
        base64Data: selectedFile.base64Data
      } : undefined
    };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setUserInput("");


    setSelectedFile(null);

    try {
      const response = await axios.post("/api/code", {
        messages: newMessages.map(msg => ({
          role: msg.role,
          text: msg.text,
          fileData: msg.fileData // Pass stored file data for history reconstruction
        })),
        currentUserPrompt: trimmedInput,
        fileData: selectedFile,
        saveToMemory: saveToMemory, // Pass memory flag
        model: codeModel, // Pass selected model
        activeRepo: activeRepo, // Pass active GitHub repo context
        workspaceId: codeContext.workspaceId,
        operatingProfileId: codeContext.operatingProfileId,
        operatingProfileMode: codeContext.operatingProfileMode,
        conversationId
      });

      const botMessage: Message = { text: response.data.text, role: "bot", timestamp: new Date() };
      setMessages((prevMessages) => [...prevMessages, botMessage]);
    } catch (error: any) {
      console.error("[CODE_PAGE_ERROR]", error);
      if (error.response?.status === 401) {
        window.location.href = "/sign-in?redirect_url=" + encodeURIComponent(window.location.pathname);
        return;
      }
      setError(error.response?.data?.details || "Sorry, something went wrong processing your request.");
    } finally {
      setLoading(false);
      trackActivity("message");
    }
  };

  const handleAttachClick = () => { fileInputRef.current?.click(); };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setLoading(true);
      setError(null);
      try {
        const base64Data = await readFileAsBase64(file);
        setSelectedFile({
          name: file.name,
          type: file.type || 'text/plain',
          base64Data: base64Data
        });
      } catch (err) {
        console.error("Error reading file:", err);
        setError("Sorry, could not read the selected file.");
        setSelectedFile(null);
      } finally {
        setLoading(false);
      }
    }
    if (fileInputRef.current) { fileInputRef.current.value = ""; }
  };

  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    } else if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const { selectionStart, selectionEnd, value } = e.currentTarget;
      setUserInput(value.substring(0, selectionStart) + '  ' + value.substring(selectionEnd));
      e.currentTarget.selectionStart = e.currentTarget.selectionEnd = selectionStart + 2;
    }
  };

  // Modern Typing Indicator (matching conversation page)
  // Nudge Integration
  const { showNudge, trackActivity, dismissNudge } = useSupportNudge();

  return (
    <div className="flex flex-col h-[100dvh] bg-background text-foreground relative overflow-hidden">
      <KoFiNudge isOpen={showNudge} onClose={dismissNudge} />

      {/* Header - Compact and pinned top */}
      <header className="flex-none px-4 py-3 border-b border-border/40 bg-background/80 backdrop-blur-md z-20 flex items-center justify-between sticky top-0">
        <div className="flex items-center gap-2">
          {/* Title and Icon */}
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center">
              <CodeIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-tight">Weaver Code</h1>
              <div className="flex items-center gap-2 flex-wrap">
                <div className={cn("text-[10px] text-muted-foreground transition-all duration-300 flex items-center gap-1", isMemoryPulsing && "text-green-500 font-bold scale-105")}>
                  <span className={cn("w-1.5 h-1.5 rounded-full bg-green-500", isMemoryPulsing && "animate-ping")} />
                  {memoryCount} memories
                </div>
                {(codeContext.workspaceName || codeContext.operatingProfileName) && (
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground rounded-full bg-muted px-2 py-0.5">
                    <span>{codeContext.workspaceName ?? "Workspace"}</span>
                    {codeContext.operatingProfileName && <span>· {codeContext.operatingProfileName}</span>}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Actions */}
        <div className="flex gap-2 items-center">
          {/* Active Repo Badge */}
          {activeRepo ? (
            <button
              onClick={() => setIsRepoModalOpen(true)}
              className="flex items-center gap-1 px-2 py-1 bg-green-500/10 text-green-600 dark:text-green-400 rounded-md text-xs font-medium border border-green-500/20 hover:border-green-500/40 transition"
            >
              <Github className="h-3 w-3" />
              <span className="max-w-[120px] truncate">{activeRepo}</span>
            </button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsRepoModalOpen(true)}
              className="gap-2 text-xs"
            >
              <Github className="h-3.5 w-3.5" />
              Connect GitHub Repo
            </Button>
          )}

          {messages.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
              <AlertCircle className="h-3 w-3" />
              {messages.length} msgs
            </div>
          )}
        </div>
      </header>

      {/* Main Chat Area */}
      {/* ... (keep existing chat area) ... */}
      <div ref={chatContainerRef} className="flex-1 overflow-y-auto overflow-x-hidden w-full scroll-smooth">
        <div className="max-w-3xl mx-auto w-full px-4 py-6 md:px-6 min-h-0">

          {/* Greeting */}
          {showGreeting && (
            <div className="flex flex-col items-center justify-center min-h-[40vh] text-center space-y-4 animate-in fade-in zoom-in duration-500">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-green-500 via-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-green-500/20">
                <CodeIcon className="h-8 w-8 text-white" />
              </div>
              <div className="space-y-2 max-w-sm">
                <h2 className="text-xl font-semibold tracking-tight">Code Assistant</h2>
                <p className="text-muted-foreground text-sm leading-relaxed">
                  {GREETING_MESSAGE}
                </p>
                <div className="flex justify-center pt-4">
                  <Button variant="outline" size="sm" onClick={handleGitHubClick} className="gap-2 text-xs">
                    <Github className="h-3.5 w-3.5" />
                    Load Repository Context
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Message List */}
          {messages.map((msg, index) => (
            // ... (Keep existing message rendering)
            <div key={index} className={cn(
              "group w-full mb-6 flex",
              msg.role === "user" ? "justify-end" : "justify-start"
            )}>
              <div className={cn(
                "flex max-w-[90%] md:max-w-[85%] gap-3 min-w-0",
                msg.role === "user" ? "flex-row-reverse" : "flex-row"
              )}>
                {/* Avatars */}
                <div className="flex-shrink-0 mt-1">
                  {msg.role === "bot" ? (
                    <Avatar className="h-8 w-8 ring-1 ring-border/50 bg-background">
                      <AvatarImage src="/Genie.png" />
                      <AvatarFallback className="text-[10px] bg-gradient-to-br from-green-500 to-emerald-500 text-white">AI</AvatarFallback>
                    </Avatar>
                  ) : (
                    <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                      <PersonIcon className="h-4 w-4 text-primary" />
                    </div>
                  )}
                </div>

                {/* Content Bubble */}
                <div className={cn(
                  "relative text-sm md:text-base leading-relaxed break-words flex-1 min-w-0 overflow-x-auto",
                  msg.role === "user"
                    ? "bg-secondary text-secondary-foreground rounded-[20px] rounded-tr-sm px-4 py-3 md:px-5 md:py-4 shadow-sm"
                    : "bg-transparent text-foreground px-0 py-0"
                )}>
                  {msg.role === "bot" ? (
                    <>
                      <ReactMarkdown
                        components={{
                          code({ node, className, children, ...props }) {
                            const match = /language-(\w+)/.exec(className || '');
                            const codeString = String(children).replace(/\n$/, '');
                            return match ? (
                              <CodeBlock codeString={codeString} language={match[1]} />
                            ) : (
                              <code className="bg-muted px-1.5 py-0.5 rounded-md font-mono text-[13px] text-green-600 dark:text-green-400" {...props}>
                                {children}
                              </code>
                            );
                          },
                          p: ({ node, ...props }) => <p {...props} className="mb-4 last:mb-0" />,
                          ul: ({ node, ...props }) => <ul {...props} className="list-disc list-outside ml-4 mb-4 space-y-2 marker:text-muted-foreground" />,
                          ol: ({ node, ...props }) => <ol {...props} className="list-decimal list-outside ml-4 mb-4 space-y-2 marker:text-muted-foreground" />,
                          li: ({ node, ...props }) => <li {...props} className="pl-1" />,
                          h1: ({ node, ...props }) => <h1 {...props} className="text-2xl font-semibold mb-4 mt-6 first:mt-0 tracking-tight" />,
                          h2: ({ node, ...props }) => <h2 {...props} className="text-xl font-semibold mb-3 mt-5 tracking-tight" />,
                          h3: ({ node, ...props }) => <h3 {...props} className="text-lg font-medium mb-2 mt-4" />,
                          blockquote: ({ node, ...props }) => <blockquote {...props} className="border-l-4 border-green-500/40 pl-4 italic text-muted-foreground my-4" />,
                          a: ({ node, ...props }) => <a {...props} className="text-green-500 hover:text-green-600 font-medium underline underline-offset-4 transition-colors" target="_blank" rel="noreferrer" />,
                          table: ({ node, ...props }) => (
                            <div className="my-4 w-full overflow-x-auto">
                              <table className="w-full" {...props} />
                            </div>
                          ),
                          th: ({ node, ...props }) => <th {...props} className="border-b border-border px-4 py-2 text-left font-semibold bg-muted/30" />,
                          td: ({ node, ...props }) => <td {...props} className="border-b border-border px-4 py-2" />,
                        }}
                      >
                        {msg.text}
                      </ReactMarkdown>

                      {/* Action Bar (Copy/Share) */}
                      <div className="mt-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <ShareIconButton
                          content={{
                            title: "Genie Code Response",
                            text: msg.text.substring(0, 300),
                            url: typeof window !== "undefined" ? window.location.href : undefined,
                          }}
                          className="h-8 w-8 bg-background border rounded-full hover:bg-muted text-muted-foreground"
                        />
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

      {/* ... (Scroll button) ... */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-28 right-6 z-30 h-10 w-10 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-lg flex items-center justify-center transition-all duration-200 animate-in fade-in slide-in-from-bottom-2"
          aria-label="Scroll to bottom"
        >
          <ArrowDown className="h-5 w-5" />
        </button>
      )}

      {/* Input Area */}
      <div className="flex-none w-full p-4 bg-gradient-to-t from-background via-background to-transparent pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="max-w-3xl mx-auto relative">
          {/* File Preview Pill */}
          {selectedFile && (
            <div className="absolute -top-10 left-0 animate-in slide-in-from-bottom-2 fade-in flex items-center gap-4">
              <div className="flex items-center gap-2 bg-background border border-border shadow-sm px-3 py-1.5 rounded-full text-xs font-medium text-foreground">
                <Paperclip className="h-3 w-3 text-green-500" />
                <span className="max-w-[150px] truncate">{selectedFile.name}</span>
                <button
                  onClick={() => setSelectedFile(null)}
                  className="text-muted-foreground hover:text-destructive transition-colors ml-1"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>

              {/* Save to Memory Toggle */}
              <div className="flex items-center gap-2 bg-background/80 backdrop-blur-sm border border-border/50 px-3 py-1.5 rounded-full shadow-sm">
                <Switch
                  id="save-memory"
                  checked={saveToMemory}
                  onCheckedChange={setSaveToMemory}
                  className="h-4 w-7 data-[state=checked]:bg-green-500"
                />
                <Label htmlFor="save-memory" className="text-[10px] font-medium text-muted-foreground cursor-pointer select-none">
                  Save to Knowledge Base
                </Label>
              </div>
            </div>
          )}

          {/* Input Container */}
          <div className="relative flex items-end gap-2 bg-muted/40 hover:bg-muted/60 focus-within:bg-background focus-within:ring-2 focus-within:ring-green-500/20 border border-border/50 rounded-[26px] p-2 transition-all duration-200 shadow-sm">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              style={{ display: 'none' }}
              accept=".js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.cs,.go,.php,.rb,.swift,.kt,.html,.css,.scss,.json,.yaml,.yml,.md,.txt,.xml,.sql,.sh,.bash,.env,.config,text/plain,application/json,image/*"
            />

            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                if (fileInputRef.current) {
                  fileInputRef.current.click();
                } else {
                  console.error("File input ref is null");
                }
              }}
              disabled={loading}
              className="h-10 w-10 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50 shrink-0"
            >
              <Paperclip className="h-5 w-5" />
            </Button>

            <div className="pb-1 shrink-0">
              <CodeModelToggle disabled={loading} />
            </div>

            <Textarea
              rows={1}
              placeholder="Ask a coding question..."
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={handleKeyPress}
              disabled={loading}
              className="flex-1 min-h-[44px] max-h-32 py-3 bg-transparent border-0 focus-visible:ring-0 resize-none text-base leading-relaxed placeholder:text-muted-foreground/70 font-mono"
            />

            <Button
              onClick={handleSendMessage}
              disabled={loading || (!userInput.trim() && !selectedFile)}
              size="icon"
              className={cn(
                "h-10 w-10 rounded-full shrink-0 transition-all duration-200",
                (userInput.trim() || selectedFile)
                  ? "bg-green-600 hover:bg-green-700 text-white shadow-md transform active:scale-95"
                  : "bg-transparent text-muted-foreground hover:bg-muted/50"
              )}
            >
              <SendHorizontal className="h-5 w-5" />
            </Button>
          </div>

          <div className="text-center mt-2">
            <p className="text-[10px] text-muted-foreground/60 font-medium">
              AI generated code. Review before using.
            </p>
          </div>
        </div>
      </div>

      {/* GitHub Consent Modal */}
      <GitHubConsentModal
        isOpen={isGitHubModalOpen}
        onClose={() => setIsGitHubModalOpen(false)}
        onConfirm={handleGitHubActionConfirm}
        action={gitHubAction || { type: 'commit', repo: 'unknown', description: 'No action pending' }}
      />

      {/* GitHub Repo Modal for Context Loading */}
      <GitHubRepoModal
        isOpen={isRepoModalOpen}
        onClose={() => setIsRepoModalOpen(false)}
        onIndexComplete={(repoInfo) => {
          setActiveRepo(`${repoInfo.owner}/${repoInfo.repo}`);
          setIsRepoModalOpen(false);
        }}
      />
    </div>
  );
}

// Wrapper to provide context
export default function CodePage() {
  return (
    <CodeModelProvider>
      <CodePageContent />
    </CodeModelProvider>
  );
}

// Module-scoped so its identity is stable across renders (react-hooks/static-components)
function TypingIndicator() {
  return (
    <div className="flex items-center space-x-3 mb-6 animate-in fade-in duration-300">
      <Avatar className="h-8 w-8 ring-1 ring-border/50">
        <AvatarImage src="/Genie.png" />
        <AvatarFallback className="bg-gradient-to-br from-green-500 to-emerald-500 text-white text-xs">AI</AvatarFallback>
      </Avatar>
      <div className="flex items-center space-x-1.5 h-8">
        <div className="h-2 w-2 bg-green-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
        <div className="h-2 w-2 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
        <div className="h-2 w-2 bg-teal-400 rounded-full animate-bounce"></div>
      </div>
    </div>
  );
}
