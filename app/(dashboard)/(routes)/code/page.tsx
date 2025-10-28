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
    <div className="h-full flex flex-col p-4 md:p-6 lg:p-8">
      <Heading
        title="Genie Code"
        description="Your AI pair programmer. Ask questions or attach code."
        icon={CodeIcon}
        iconColor="text-green-500" // Adjusted color
        bgColor="bg-green-500/10"
      />

      <ScrollArea className="flex-grow rounded-md border p-2 md:p-4 my-4 bg-background">
        {/* Greeting */}
        {showGreeting && (
          <div className="flex items-start space-x-2 md:space-x-3 mb-4">
            <Avatar className="h-8 w-8"><AvatarImage src="/Genie.png" alt="Genie Avatar" /><AvatarFallback>G</AvatarFallback></Avatar>
            <div className="p-3 rounded-lg bg-muted text-sm">{GREETING_MESSAGE}</div>
          </div>
        )}

        {/* Messages */}
        {messages.map((msg, index) => (
          <div key={index} className={cn("mb-4 flex items-start space-x-2 md:space-x-3", msg.role === "user" ? "justify-end" : "justify-start")}>
            {msg.role === "bot" && (<Avatar className="h-8 w-8"><AvatarImage src="/Genie.png" alt="Genie Avatar" /><AvatarFallback>G</AvatarFallback></Avatar>)}
            <div className={cn("max-w-[85%] sm:max-w-[75%] rounded-lg shadow-sm text-sm break-words", // Removed padding here, handled by markdown/codeblock
                               msg.role === "user" ? "bg-primary text-primary-foreground p-3" // Add padding back for user messages
                                                   : "bg-muted")}> {/* Bot messages get padding from children */}
              {msg.role === "bot" ? (
                <ReactMarkdown
                  components={{
                    // Use CodeBlock component for fenced code blocks
                    code({ node, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '');
                      const codeString = String(children).replace(/\n$/, '');
                      return match ? (
                        <CodeBlock codeString={codeString} language={match[1]} />
                      ) : (
                        // Style inline code
                        <code className={cn("bg-background px-1 rounded text-xs font-mono", className)} {...props}>
                          {children}
                        </code>
                      );
                    },
                     // Add standard styling for paragraphs within bot messages
                     p: ({ node, ...props }) => <p {...props} className="mb-2 last:mb-0 px-3 py-1" />, // Added padding to paragraphs
                  }}
                >
                  {msg.text}
                </ReactMarkdown>
              ) : (
                <p className="whitespace-pre-wrap">{msg.text}</p> // User message text
              )}
            </div>
            {msg.role === "user" && (<Avatar className="h-8 w-8"><AvatarFallback><PersonIcon /></AvatarFallback></Avatar>)}
          </div>
        ))}
        {loading && <TypingIndicator />}
        {error && <p className="text-destructive text-sm p-2 text-center">{error}</p>}
      </ScrollArea>

      {/* Footer */}
      <footer className="flex items-end gap-1 md:gap-2 mt-4">
        <Button variant="ghost" size="icon" onClick={handleAttachClick} disabled={loading} aria-label="Attach code file">
          <Paperclip className="h-5 w-5" />
        </Button>
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          className="hidden"
          accept=".js,.jsx,.ts,.tsx,.py,.java,.c,.cpp,.cs,.go,.php,.rb,.swift,.kt,.html,.css,.scss,.json,.yaml,.md,text/plain"
        />
        {selectedFile && (
          <div className="text-xs text-muted-foreground p-2 border rounded-md bg-muted truncate max-w-[100px] sm:max-w-[150px]">
            {selectedFile.name}
          </div>
        )}
        <Textarea
          rows={1}
          placeholder={selectedFile ? "Add instructions for the code..." : "Ask a coding question or attach code..."}
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={handleKeyPress}
          disabled={loading}
          className="flex-1 resize-none max-h-40 min-h-[40px] focus-visible:ring-1 focus-visible:ring-ring text-sm font-mono" // Monospace font
        />
        <Button
          onClick={handleSendMessage}
          disabled={loading || (!userInput.trim() && !selectedFile)}
          size="icon"
          aria-label="Send message"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M3.105 3.105a1.5 1.5 0 011.995-.21l12 6a1.5 1.5 0 010 2.21l-12 6A1.5 1.5 0 013 16.5V3.5a1.5 1.5 0 01.105-.395z"></path></svg>
        </Button>
      </footer>
    </div>
  );
}
  
  
  
  
