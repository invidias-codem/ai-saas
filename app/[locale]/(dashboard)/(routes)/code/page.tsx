"use client";

import { useState, useRef, KeyboardEvent, useEffect } from "react";
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
import { Paperclip, AlertCircle, SendHorizontal, X, Copy, Check, RefreshCcw } from "lucide-react";
import { BrandIcon } from "@/lib/icons/brandIcons";
import { CodeIcon } from "@radix-ui/react-icons";
import { cn } from "@/lib/utils";
import { PersonIcon } from "@radix-ui/react-icons";
import { ShareIconButton } from "@/components/share-button";
import { GitHubRepoModal } from "@/components/github-repo-modal";

// ... (keep existing imports)

import { CodeModelProvider, useCodeModel } from "@/contexts/CodeModelContext";
import { CodeModelToggle } from "@/components/chat/CodeModelToggle";
import { CODE_MODELS, ProviderKeyState } from "@/lib/llm/codeModels";
import { useChatScroll } from "@/components/chat/useChatScroll";
import { ScrollToBottom } from "@/components/chat/ScrollToBottom";
import { useCodeFileUpload, CodeSelectedFile } from "@/components/chat/useCodeFileUpload";
import { useGithubRepoContext } from "@/components/chat/useGithubRepoContext";
import { useMemoryCount } from "@/components/chat/useMemoryCount";
import { MemoryInsights } from "@/components/chat/MemoryInsights";
import { useCodeConversation, CodeContext } from "@/components/chat/useCodeConversation";

// ... (keep existing imports)

// Content Component (Inner)

interface Message {
  id?: string;
  role: "user" | "bot";
  text: string;
  timestamp: Date;
  fileData?: CodeSelectedFile;
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
  const [userInput, setUserInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGreeting, setShowGreeting] = useState(true);

  // Code context + conversation bootstrap (C6): hydrate workspace/profile,
  // resolve/restore the row-backed conversation, and persist messages.
  const { codeContext, conversationId } = useCodeConversation({
    messages,
    onRestoreMessages: setMessages,
    onHideGreeting: () => setShowGreeting(false),
  });

  // Code file attachment (C2): base64 read + save-to-memory toggle.
  const {
    selectedFile,
    saveToMemory,
    setSaveToMemory,
    fileInputRef,
    handleFileChange,
    removeFile,
  } = useCodeFileUpload(setError, setLoading);

  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showContextSheet, setShowContextSheet] = useState(false);

  // Memory count badge (C5): reuses the lean count hook (no episodic fetch).
  const { memoryCount, isMemoryPulsing } = useMemoryCount(messages.length);

  // GitHub repo context (C3): active repo, linked-repo hydration, index status,
  // reindex, and persist-on-select. The onRepoLinked callback adds the
  // confirmation system message + clears the greeting.
  const {
    activeRepo,
    isRepoModalOpen,
    repoIndexed,
    reindexing,
    openRepoModal,
    closeRepoModal,
    reindexActiveRepo,
    handleRepoIndexComplete,
  } = useGithubRepoContext({
    workspaceId: codeContext.workspaceId,
    onRepoLinked: (fullName, fileCount) => {
      const botMessage: Message = {
        text: `📚 **Repository Linked:** \`${fullName}\`\nI have indexed ${fileCount} code files from this repository. You can now ask questions about the codebase!`,
        role: "bot",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, botMessage]);
      setShowGreeting(false);
    },
  });

  const GREETING_MESSAGE = "Ask me a coding question, debug code, or attach a file for analysis.";

  // ... (keep existing scroll and effect logic)

  // Chat scroll management (C1): refs, manual scroll-to-bottom, and
  // "scrolled up" detection that drives the floating ScrollToBottom button.
  const { chatContainerRef, bottomRef, scrollToBottom, showScrollButton } = useChatScroll(messages.length);

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


    removeFile();

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

      {/* Header - Compact: structural nav + overflow menu */}
      <header className="flex-none px-3 py-2 sm:px-4 sm:py-3 border-b border-border/40 bg-background/80 backdrop-blur-md z-20 flex items-center justify-between sticky top-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center shrink-0">
            <CodeIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
          </div>
          <h1 className="text-sm font-semibold leading-tight truncate">Weaver Code</h1>
        </div>

        {/* Desktop-only indicators */}
        <div className="hidden md:flex items-center gap-2">
          <MemoryInsights memoryCount={memoryCount} isMemoryPulsing={isMemoryPulsing} variant="compact" accent="green" />
          {(codeContext.workspaceName || codeContext.operatingProfileName) && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground rounded-full bg-muted px-2 py-0.5">
              <span>{codeContext.workspaceName ?? "Workspace"}</span>
              {codeContext.operatingProfileName && <span>· {codeContext.operatingProfileName}</span>}
            </div>
          )}
          {activeRepo ? (
            <button
              onClick={openRepoModal}
              className="flex items-center gap-1 px-2 py-1 bg-green-500/10 text-green-600 dark:text-green-400 rounded-md text-xs font-medium border border-green-500/20 hover:border-green-500/40 transition"
            >
              <BrandIcon name="Github" className="h-3 w-3" size={12} />
              <span className="max-w-[120px] truncate">{activeRepo}</span>
              {repoIndexed === true && (
                <span className="text-[10px] font-medium bg-green-500/20 text-green-700 dark:text-green-300 px-1.5 py-0.5 rounded-full">indexed</span>
              )}
              {repoIndexed === false && (
                <span className="text-[10px] font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 rounded-full">indexing</span>
              )}
              <button
                type="button"
                onClick={reindexActiveRepo}
                disabled={reindexing}
                className="ml-1 inline-flex items-center gap-1 text-[10px] font-medium bg-slate-500/10 text-slate-700 dark:text-slate-200 px-1.5 py-0.5 rounded-full hover:bg-slate-500/20 transition disabled:opacity-50"
              >
                <RefreshCcw className="h-3 w-3" />
                {reindexing ? 'indexing' : 're-index'}
              </button>
            </button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={openRepoModal}
              className="gap-2 text-xs"
            >
              <BrandIcon name="Github" className="h-3.5 w-3.5" size={14} />
              Connect GitHub Repo
            </Button>
          )}
          {messages.length > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
              <AlertCircle className="h-3 w-3" />
              {messages.length} msgs
            </div>
          )}
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
              <CodeModelToggle disabled={loading} />
              <MemoryInsights memoryCount={memoryCount} isMemoryPulsing={isMemoryPulsing} variant="mobile" accent="green" />
              {(codeContext.workspaceName || codeContext.operatingProfileName) && (
                <div className="rounded-lg border border-green-500/20 bg-green-500/10 px-3 py-2 text-sm">
                  <span className="font-medium">{codeContext.workspaceName}</span>
                  {codeContext.operatingProfileName && (
                    <span className="text-xs text-muted-foreground"> · {codeContext.operatingProfileName}</span>
                  )}
                </div>
              )}
              {activeRepo ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    openRepoModal();
                    setShowMobileMenu(false);
                  }}
                >
                  <BrandIcon name="Github" className="h-4 w-4" size={16} />
                  <span className="truncate">{activeRepo}</span>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start gap-2"
                  onClick={() => {
                    openRepoModal();
                    setShowMobileMenu(false);
                  }}
                >
                  <BrandIcon name="Github" className="h-4 w-4" size={16} />
                  Connect GitHub Repo
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

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
                  <Button variant="outline" size="sm" onClick={openRepoModal} className="gap-2 text-xs">
                    <BrandIcon name="Github" className="h-3.5 w-3.5" size={14} />
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
                      <AvatarImage src="/lattice-logo.png" />
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
      {showScrollButton && <ScrollToBottom onClick={scrollToBottom} accent="green" />}

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
                  onClick={removeFile}
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
            
            {/* Left: attachment group (hidden on mobile, shown on desktop) */}
            <div className="hidden sm:block">
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
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="h-10 w-10 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/50"
              >
                <Paperclip className="h-5 w-5" />
              </Button>
            </div>

            {/* Mobile: grouped + button for attachments */}
            <div className="sm:hidden relative">
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
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
              </Button>
            </div>

            {/* Model selector — mobile: above input, desktop: inline */}
            <div className="hidden sm:block pb-1 shrink-0">
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

            {/* Send button — always visible, never pushed off-screen */}
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

          {/* Mobile model selector — above input bar */}
          <div className="sm:hidden flex justify-center mt-2">
            <CodeModelToggle disabled={loading} />
          </div>

          <div className="text-center mt-2">
            <p className="text-[10px] text-muted-foreground/60 font-medium">
              AI generated code. Review before using.
            </p>
          </div>
        </div>
      </div>

      {/* GitHub Repo Modal for Context Loading */}
      <GitHubRepoModal
        isOpen={isRepoModalOpen}
        onClose={closeRepoModal}
        onIndexComplete={handleRepoIndexComplete}
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
        <AvatarImage src="/lattice-logo.png" />
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
