"use client";

import { useState, useRef, ChangeEvent, KeyboardEvent } from "react";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

import { Heading } from "@/components/heading";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {  Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";
import EmptyState from "@/components/empty";
import { ChatBubbleIcon, PersonIcon } from "@radix-ui/react-icons";

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
    const headers = table.children[0]?.children.map((th: any) => th.children[0]?.value) || [];
    const rows = table.children.slice(1).map((tr: any) =>
      tr.children.map((td: any) => td.children[0]?.value)
    );

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const GREETING_MESSAGE = "Hi there! How can I assist you today? Feel free to ask me anything or attach a file for insights.";

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
          setError(error.response?.data?.details || "Sorry, something went wrong.");
      } finally { setLoading(false); }
  };
  const handleAttachClick = () => { fileInputRef.current?.click(); };
  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => { /* ... (keep existing logic) ... */
      const file = event.target.files?.[0];
      if (file) { setSelectedFile({ name: file.name, type: file.type || 'unknown' }); }
      if(fileInputRef.current) { fileInputRef.current.value = ""; }
  };
  const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } };
  const TypingIndicator = () => { /* ... (keep existing logic) ... */
    return ( <div className="flex items-center space-x-2 p-2"><Avatar className="h-8 w-8"><AvatarImage src="/Genie.png" alt="Genie Avatar" /><AvatarFallback>G</AvatarFallback></Avatar><div className="flex items-center space-x-1.5 p-2 rounded-lg bg-muted"><div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse"></div><div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse [animation-delay:0.2s]"></div><div className="w-2 h-2 bg-muted-foreground rounded-full animate-pulse [animation-delay:0.4s]"></div></div></div> );
  };

  return (
    <div className="h-full flex flex-col p-4 md:p-6 lg:p-8">
      <Heading
        title="Genie Conversation"
        description="Chat with Genie or upload a file for insights."
        icon={ChatBubbleIcon}
        iconColor="text-sky-500"
        bgColor="bg-sky-500/10"
      />

      <ScrollArea className="flex-grow rounded-md border p-2 md:p-4 my-4 bg-background">
        {showGreeting && (
            <div className="flex items-start space-x-2 md:space-x-3 mb-4">
                 <Avatar className="h-8 w-8"><AvatarImage src="/Genie.png" alt="Genie Avatar" /><AvatarFallback>G</AvatarFallback></Avatar>
                <div className="p-3 rounded-lg bg-muted text-sm">{GREETING_MESSAGE}</div>
            </div>
        )}
        {messages.map((msg, index) => (
          <div key={index} className={cn("mb-4 flex items-start space-x-2 md:space-x-3", msg.role === "user" ? "justify-end" : "justify-start")}>
            {msg.role === "bot" && (<Avatar className="h-8 w-8"><AvatarImage src="/Genie.png" alt="Genie Avatar" /><AvatarFallback>G</AvatarFallback></Avatar>)}
            <div className={cn("max-w-[85%] sm:max-w-[75%] rounded-lg shadow-sm p-3 text-sm break-words", msg.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted")}>
              {msg.role === "bot" ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    // ✅ ONLY ONE 'table' definition, pointing to our component
                    table: RenderTableAsChart,
                    // Standard markdown element styling
                    pre: ({ node, ...props }) => <pre {...props} className="bg-muted p-2 rounded overflow-x-auto text-xs my-2" />,
                    code({ node, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '');
                      return match ? (
                        <div className="my-2"> {/* Placeholder for CodeBlock */}
                          <pre><code className={className} {...props}>{children}</code></pre>
                        </div>
                      ) : ( <code className={cn("bg-muted px-1 rounded text-xs", className)} {...props}>{children}</code> );
                    },
                    p: ({ node, ...props }) => <p {...props} className="mb-2 last:mb-0" />,
                    ul: ({ node, ...props }) => <ul {...props} className="list-disc list-inside mb-2 pl-4" />,
                    ol: ({ node, ...props }) => <ol {...props} className="list-decimal list-inside mb-2 pl-4" />,
                    li: ({ node, ...props }) => <li {...props} className="mb-1" />,
                    blockquote: ({ node, ...props }) => <blockquote {...props} className="border-l-4 border-border pl-4 italic text-muted-foreground my-2" />,
                  }}
                >
                  {msg.text}
                </ReactMarkdown>
              ) : (
                <p className="whitespace-pre-wrap">{msg.text}</p>
              )}
            </div>
            {msg.role === "user" && (<Avatar className="h-8 w-8"><AvatarFallback><PersonIcon /></AvatarFallback></Avatar>)}
          </div>
        ))}
        {loading && <TypingIndicator />}
        {error && <p className="text-destructive text-sm p-2 text-center">{error}</p>}
      </ScrollArea>

      <footer className="flex items-end gap-1 md:gap-2 mt-4">
          <Button variant="ghost" size="icon" onClick={handleAttachClick} disabled={loading} aria-label="Attach file">
            <Paperclip className="h-5 w-5" />
          </Button>
           <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
         {selectedFile && (<div className="text-xs text-muted-foreground p-2 border rounded-md bg-muted truncate max-w-[100px] sm:max-w-[150px]">{selectedFile.name}</div>)}
        <Textarea rows={1} placeholder={selectedFile ? "Add message..." : "Type message or attach..."} value={userInput} onChange={(e) => setUserInput(e.target.value)} onKeyDown={handleKeyPress} disabled={loading} className="flex-1 resize-none max-h-40 min-h-[40px] focus-visible:ring-1 focus-visible:ring-ring text-sm" />
        <Button onClick={handleSendMessage} disabled={loading || (!userInput.trim() && !selectedFile)} size="icon" aria-label="Send message">
           <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M3.105 3.105a1.5 1.5 0 011.995-.21l12 6a1.5 1.5 0 010 2.21l-12 6A1.5 1.5 0 013 16.5V3.5a1.5 1.5 0 01.105-.395z"></path></svg>
        </Button>
      </footer>
    </div>
  );
}