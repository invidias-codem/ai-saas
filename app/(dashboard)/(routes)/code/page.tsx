"use client";

import { useState, useRef, ChangeEvent, KeyboardEvent } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'; // Or your preferred theme
import { useClipboard } from "use-clipboard-copy";

// Shadcn UI & Icons
import { Heading } from "@/components/heading";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CodeIcon, Paperclip } from "lucide-react"; // Use lucide-react icons
import { cn } from "@/lib/utils";
import EmptyState from "@/components/empty"; // Assuming EmptyState component exists
import { PersonIcon } from "@radix-ui/react-icons";
import { ShareIconButton } from "@/components/share-button";

// Define the message structure
interface Message {
  text: string;
  role: "user" | "bot";
  timestamp: Date;
}

// Define state for the selected file (including content)
interface SelectedFile {
  name: string;
  type: string;
  base64Data: string; // Store content as Base64
}

// Helper component for Code Blocks with Copy Button
const CodeBlock = ({ codeString, language }: { codeString: string, language: string | undefined }) => {
  const clipboard = useClipboard({ copiedTimeout: 1500 });
  const handleCopy = () => { clipboard.copy(codeString); };

  // Determine language for highlighter, default if not specified
  const effectiveLanguage = language || 'plaintext';

  return (
    <div className="relative my-2 text-sm"> {/* Ensure text size is consistent */}
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1 bg-gray-700 rounded text-white text-xs hover:bg-gray-600 z-10"
        aria-label="Copy code"
      >
        {clipboard.copied ? "Copied!" : "Copy"}
      </button>
      <SyntaxHighlighter
        style={vscDarkPlus}
        language={effectiveLanguage}
        PreTag="div"
        className="!bg-gray-800 rounded p-4 overflow-x-auto" // Added padding and overflow
        // Use custom style to potentially override line height/padding if needed
        customStyle={{ margin: 0 }}
        wrapLongLines={true} // Helps prevent horizontal scroll where possible
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const GREETING_MESSAGE = "Hi there! Ask me a coding question or attach a code file for review or explanation.";

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

  // Handle sending message (text and file data)
  const handleSendMessage = async () => {
    const trimmedInput = userInput.trim();
    if (!trimmedInput && !selectedFile) return;

    setLoading(true);
    setError(null);
    setShowGreeting(false);

    let messageText = trimmedInput;
    // Append file info for display in the user's message bubble
    if (selectedFile) {
      messageText += `\n\n[Analysing File: ${selectedFile.name}]`;
    }

    const userMessage: Message = { text: messageText, role: "user", timestamp: new Date() };
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setUserInput(""); // Clear text input

    // Prepare payload, including file data if present
    const apiPayload = {
      messages: newMessages.map(msg => ({ // Send history for context
        role: msg.role,
        text: msg.text // Keep previous texts for context
      })),
      currentUserPrompt: trimmedInput, // Send only the current text input
      fileData: selectedFile // Send the file object { name, type, base64Data }
    };

    // Clear selected file *after* preparing payload
    setSelectedFile(null);

    try {
      // Send payload to the backend code API route
      const response = await axios.post("/api/code", apiPayload);
      const botMessage: Message = { text: response.data.text, role: "bot", timestamp: new Date() };
      setMessages((prevMessages) => [...prevMessages, botMessage]);
    } catch (error: any) {
      console.error("[CODE_PAGE_ERROR]", error);
      setError(error.response?.data?.details || "Sorry, something went wrong processing your request.");
      // Optionally roll back optimistic UI: setMessages(messages);
    } finally {
      setLoading(false);
    }
  };

  // Trigger file input click
  const handleAttachClick = () => { fileInputRef.current?.click(); };

  // Handle file selection and read content
  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      console.log("File selected:", file.name, file.type, file.size);
      setLoading(true); // Indicate file reading
      setError(null);
      try {
        const base64Data = await readFileAsBase64(file);
        setSelectedFile({
          name: file.name,
          // Use a specific MIME type if known, otherwise default
          type: file.type || 'text/plain', // Default to text/plain for code files if type unknown
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
    if (fileInputRef.current) { fileInputRef.current.value = ""; } // Reset input
  };

  // Handle Enter/Tab key press
  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    } else if (e.key === 'Tab' && !e.shiftKey) { // Basic Tab indentation
      e.preventDefault();
      const { selectionStart, selectionEnd, value } = e.currentTarget;
      setUserInput(value.substring(0, selectionStart) + '  ' + value.substring(selectionEnd));
      e.currentTarget.selectionStart = e.currentTarget.selectionEnd = selectionStart + 2;
    }
  };

  // Typing Indicator Component
  const TypingIndicator = () => (
    <div className="flex items-center space-x-2 p-2">
      <Avatar className="h-8 w-8"><AvatarImage src="/Genie.png" alt="Genie Avatar" /><AvatarFallback>G</AvatarFallback></Avatar>
      <div className="flex items-center space-x-1.5 p-2 rounded-lg bg-muted">
        <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse"></div>
        <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse [animation-delay:0.2s]"></div>
        <div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse [animation-delay:0.4s]"></div>
      </div>
    </div>
  );

  return (
    <div className="h-[calc(100dvh-5rem)] md:h-full flex flex-col">
      <div className="px-4 py-2">
        <Heading
          title="Genie Code"
          description="Your AI pair programmer. Ask questions or attach code."
          icon={CodeIcon}
          iconColor="text-green-500"
          bgColor="bg-green-500/10"
        />
      </div>

      <div className="flex-grow flex flex-col md:px-8 overflow-hidden">
        <ScrollArea className="flex-1 p-2 md:p-4 rounded-md border bg-background/50 backdrop-blur-sm shadow-sm">
          {/* Greeting */}
          <div className="max-w-4xl mx-auto">
            {showGreeting && (
              <div className="flex items-start space-x-2 md:space-x-3 mb-8 mt-4">
                <Avatar className="h-8 w-8 mt-1"><AvatarImage src="/Genie.png" alt="Genie Avatar" /><AvatarFallback>G</AvatarFallback></Avatar>
                <div className="p-4 rounded-2xl bg-muted/50 text-sm leading-relaxed border border-border/50 max-w-[90%]">
                  {GREETING_MESSAGE}
                </div>
              </div>
            )}

            {/* Messages */}
            {messages.map((msg, index) => (
              <div key={index} className={cn("mb-8 flex gap-2 md:gap-3 group",
                msg.role === "user" ? "flex-col-reverse md:flex-row items-end justify-end" : "flex-col md:flex-row items-start justify-start")}>
                {msg.role === "bot" && (<Avatar className="h-8 w-8 md:mt-1 flex-shrink-0"><AvatarImage src="/Genie.png" alt="Genie Avatar" /><AvatarFallback>G</AvatarFallback></Avatar>)}
                <div className={cn("max-w-full md:max-w-[85%] rounded-2xl shadow-sm text-sm break-words relative leading-relaxed",
                  msg.role === "user" ? "bg-primary text-primary-foreground p-4 rounded-tr-none md:rounded-tr-none rounded-br-none md:rounded-br-xl" : "bg-muted/80 dark:bg-muted/40 backdrop-blur-sm rounded-tl-none md:rounded-tl-none rounded-bl-none md:rounded-bl-xl border border-border/50")}>
                  {msg.role === "bot" ? (
                    <>
                      <div className="p-4 pb-2">
                        <ReactMarkdown
                          components={{
                            // Use CodeBlock component for fenced code blocks
                            code({ node, className, children, ...props }) {
                              const match = /language-(\w+)/.exec(className || '');
                              const codeString = String(children).replace(/\n$/, '');
                              return match ? (
                                <div className="my-4 -mx-4 md:mx-0"> {/* Negative margin on mobile to let code span full width */}
                                  <CodeBlock codeString={codeString} language={match[1]} />
                                </div>
                              ) : (
                                // Style inline code
                                <code className={cn("bg-zinc-200 dark:bg-zinc-800 px-1.5 py-0.5 rounded font-mono text-xs", className)} {...props}>
                                  {children}
                                </code>
                              );
                            },
                            // Add standard styling for paragraphs within bot messages
                            p: ({ node, ...props }) => <p {...props} className="mb-3 last:mb-0" />,
                            ul: ({ node, ...props }) => <ul {...props} className="list-disc list-inside mb-3 pl-2 space-y-1" />,
                            ol: ({ node, ...props }) => <ol {...props} className="list-decimal list-inside mb-3 pl-2 space-y-1" />,
                            li: ({ node, ...props }) => <li {...props} className="pl-1" />,
                          }}
                        >
                          {msg.text}
                        </ReactMarkdown>
                      </div>
                      {/* Share button - appears on hover */}
                      <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <ShareIconButton
                          content={{
                            title: "Genie Code Response",
                            text: msg.text.length > 280 ? msg.text.substring(0, 277) + "..." : msg.text,
                            url: typeof window !== "undefined" ? window.location.href : undefined,
                          }}
                          className="h-8 w-8 bg-background/50 hover:bg-background shadow-sm border"
                        />
                      </div>
                    </>
                  ) : (
                    <p className="whitespace-pre-wrap">{msg.text}</p> // User message text
                  )}
                </div>
                {msg.role === "user" && (<Avatar className="h-8 w-8 mt-1 flex-shrink-0"><AvatarFallback><PersonIcon /></AvatarFallback></Avatar>)}
              </div>
            ))}
            {loading && <TypingIndicator />}
            <div className="h-4" /> {/* Spacer */}
          </div>
        </ScrollArea>

        {error && <div className="p-2 text-center"><p className="text-destructive text-sm bg-destructive/10 py-1 px-3 rounded-full inline-block">{error}</p></div>}

        {/* Footer */}
        <div className="p-2 pt-0 md:p-4 max-w-4xl mx-auto w-full">
          <div className="flex items-end gap-2 p-2 rounded-xl border bg-background shadow-xs focus-within:ring-1 focus-within:ring-ring transition-all">
            <Button variant="ghost" size="icon" onClick={handleAttachClick} disabled={loading} aria-label="Attach code file" className="h-9 w-9 text-muted-foreground hover:text-primary shrink-0">
              <Paperclip className="h-5 w-5" />
            </Button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              className="hidden"
              accept=".js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.cs,.go,.php,.rb,.swift,.kt,.html,.css,.scss,.json,.yaml,.md,text/plain"
            />

            <div className="flex-1 min-w-0 flex flex-col justify-center">
              {selectedFile && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 px-2 py-1 rounded-md mb-1 w-fit max-w-full">
                  <span className="truncate max-w-[150px]">{selectedFile.name}</span>
                  <button onClick={() => setSelectedFile(null)} className="hover:text-destructive">×</button>
                </div>
              )}
              <Textarea
                rows={1}
                placeholder={selectedFile ? "Add instructions..." : "Ask a coding question..."}
                value={userInput}
                onChange={(e) => setUserInput(e.target.value)}
                onKeyDown={handleKeyPress}
                disabled={loading}
                className="min-h-[24px] max-h-40 border-0 focus-visible:ring-0 resize-none p-0 bg-transparent text-sm font-mono leading-relaxed"
              />
            </div>

            <Button
              onClick={handleSendMessage}
              disabled={loading || (!userInput.trim() && !selectedFile)}
              size="icon"
              aria-label="Send message"
              className="h-9 w-9 shrink-0 shadow-none transition-transform active:scale-95"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5"><path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" /></svg>
            </Button>
          </div>
          <div className="text-[10px] text-muted-foreground text-center mt-2 hidden md:block">
            AI generated code. Review before using.
          </div>
        </div>
      </div>
    </div>
  );
}




