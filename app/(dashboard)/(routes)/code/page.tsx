"use client";

import { useState, useRef, ChangeEvent, KeyboardEvent, useEffect } from "react";
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
import { Paperclip, AlertCircle, SendHorizontal, X, Copy, Check, ArrowDown, Github } from "lucide-react";
import { CodeIcon } from "@radix-ui/react-icons";
import { cn } from "@/lib/utils";
import { PersonIcon } from "@radix-ui/react-icons";
import { ShareIconButton } from "@/components/share-button";
import { GitHubConsentModal } from "@/components/github-consent-modal";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  getSessionMemoryFromStorage,
  saveSessionMemoryToStorage,
  SessionMessage,
} from "@/lib/sessionClientMemory";
// Removed manual compression - relying on native HTTP compression (Brotli/Gzip)

// Define the message structure
interface Message {
  text: string;
  role: "user" | "bot";
  timestamp: Date;
  fileData?: {
    name: string;
    type: string;
    base64Data: string;
  };
}

// Define state for the selected file
interface SelectedFile {
  name: string;
  type: string;
  base64Data: string;
}

// Modern Code Block with Copy Button
const CodeBlock = ({ codeString, language }: { codeString: string, language: string | undefined }) => {
  const clipboard = useClipboard({ copiedTimeout: 1500 });
  const handleCopy = () => { clipboard.copy(codeString); };
  const effectiveLanguage = language || 'plaintext';

  return (
    <div className="relative w-full overflow-hidden my-4 rounded-xl border bg-zinc-950 dark:bg-zinc-900 shadow-md">
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800">
        <span className="text-xs text-zinc-400 font-mono">{effectiveLanguage}</span>
        <button
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-zinc-400 hover:text-white transition-colors rounded-md hover:bg-zinc-800"
          aria-label="Copy code"
        >
          {clipboard.copied ? (
            <><Check className="h-3.5 w-3.5" /> Copied!</>
          ) : (
            <><Copy className="h-3.5 w-3.5" /> Copy</>
          )}
        </button>
      </div>
      <SyntaxHighlighter
        style={vscDarkPlus}
        language={effectiveLanguage}
        PreTag="div"
        className="!bg-transparent !m-0 p-4 overflow-x-auto text-sm font-mono leading-relaxed scrollbar-thin scrollbar-thumb-zinc-700"
        customStyle={{ margin: 0, background: 'transparent' }}
        wrapLongLines={true}
      >
        {codeString}
      </SyntaxHighlighter>
    </div>
  );
};

// Main Page Component
export default function CodePage() {
  const [messages, setMessages] = useState<Message[]>([]);
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

  // GitHub Consent State
  const [isGitHubModalOpen, setIsGitHubModalOpen] = useState(false);
  const [gitHubAction, setGitHubAction] = useState<any>(null);

  const handleGitHubConnect = () => {
    window.location.href = "/api/integrations/github/auth"; // Trigger OAuth
  };

  const handleGitHubActionConfirm = async () => {
    console.log("Executing GitHub action:", gitHubAction);
    setIsGitHubModalOpen(false);
    // Mock execution for UI demo
    const botMessage: Message = { text: `✅ Successfully executed GitHub Action: ${gitHubAction?.type} on ${gitHubAction?.repo}`, role: "bot", timestamp: new Date() };
    setMessages((prev) => [...prev, botMessage]);
  };

  const GREETING_MESSAGE = "Ask me a coding question, debug code, or attach a file for analysis.";

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

  // Persistence for Code Session
  const CODE_CONVERSATION_ID = 'local-code-session';

  // Initialize session from storage
  useEffect(() => {
    const savedMessages = getSessionMemoryFromStorage(CODE_CONVERSATION_ID);
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
  }, []);

  // Save to storage on change
  useEffect(() => {
    if (messages.length > 0) {
      const sessionMessages: SessionMessage[] = messages.map(msg => ({
        text: msg.text,
        role: msg.role,
        timestamp: msg.timestamp.getTime(),
        fileData: msg.fileData
      }));
      saveSessionMemoryToStorage(sessionMessages, 'current-user', 'code-session', CODE_CONVERSATION_ID);
    }
  }, [messages]);

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
        saveToMemory: saveToMemory // Pass memory flag
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
  const TypingIndicator = () => {
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
  };

  // Nudge Integration
  const { showNudge, trackActivity, dismissNudge } = useSupportNudge();

  return (
    <div className="flex flex-col h-[100dvh] bg-background text-foreground relative overflow-hidden">
      <KoFiNudge isOpen={showNudge} onClose={dismissNudge} />

      {/* Header - Compact and pinned top */}
      <header className="flex-none px-4 py-3 border-b border-border/40 bg-background/80 backdrop-blur-md z-20 flex items-center justify-between sticky top-0">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-lg bg-green-500/10 flex items-center justify-center">
            <CodeIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
          </div>
          <div>
            <h1 className="text-sm font-semibold leading-tight">Genie Code</h1>
            <div className="flex items-center gap-2">
              {/* Memory Counter */}
              <div className={cn("text-[10px] text-muted-foreground transition-all duration-300 flex items-center gap-1", isMemoryPulsing && "text-green-500 font-bold scale-105")}>
                <span className={cn("w-1.5 h-1.5 rounded-full bg-green-500", isMemoryPulsing && "animate-ping")} />
                {memoryCount} memories
              </div>
            </div>
          </div>
        </div>

        {/* Message count indicator and GitHub button */}
        <div className="flex gap-2 items-center">
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
          {messages.length > 0 && (
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-full bg-muted text-[10px] font-medium text-muted-foreground">
              <AlertCircle className="h-3 w-3" />
              {messages.length} msgs
            </div>
          )}
        </div>
      </header>

      {/* Main Chat Area */}
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

      {/* Scroll to Bottom Button */}
      {showScrollButton && (
        <button
          onClick={scrollToBottom}
          className="fixed bottom-28 right-6 z-30 h-10 w-10 rounded-full bg-green-600 hover:bg-green-700 text-white shadow-lg flex items-center justify-center transition-all duration-200 animate-in fade-in slide-in-from-bottom-2"
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
    </div>
  );
}
