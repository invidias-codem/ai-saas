"use client";

import { useState, SetStateAction } from "react"; // Removed unused 'useEffect'
import { CodeSandboxLogoIcon, FaceIcon } from "@radix-ui/react-icons";
import axios from "axios";
import ReactMarkdown from "react-markdown";
// Removed the broken 'CodeProps' import
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { useClipboard } from "use-clipboard-copy";

// Define the message structure
interface Message {
  text: string;
  role: "user" | "bot";
  timestamp: Date;
}

// Helper component to manage clipboard state
const CodeBlock = ({ codeString, language }: { codeString: string, language: string }) => {
  const clipboard = useClipboard({
    copiedTimeout: 1500, // Reset "Copied!" text after 1.5s
  });

  const handleCopy = () => {
    clipboard.copy(codeString);
  };

  return (
    <div className="relative">
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1 bg-gray-700 rounded text-white text-xs hover:bg-gray-600 z-10"
      >
        {clipboard.copied ? "Copied!" : "Copy"}
      </button>
      <SyntaxHighlighter
        style={vscDarkPlus}
        language={language}
        PreTag="div"
      >
        {codeString}
      </SyntaxHighlighter>
    </div>
  );
};


export default function CodePage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [userInput, setUserInput] = useState("");
  const [theme, setTheme] = useState("dark");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGreeting, setShowGreeting] = useState(true);

  const GREETING_MESSAGE = "Hi there! How can I help you code today?";

  const handleSendMessage = async () => {
    if (!userInput.trim()) return;

    setLoading(true);
    setError(null);
    setShowGreeting(false);

    const userMessage: Message = {
      text: userInput,
      role: "user",
      timestamp: new Date(),
    };

    // Optimistically update the UI
    const newMessages = [...messages, userMessage];
    setMessages(newMessages);
    setUserInput("");

    try {
      const response = await axios.post("/api/code", {
        // Send only the necessary data
        messages: newMessages.map(msg => ({
          role: msg.role,
          text: msg.text
        }))
      });

      const botMessage: Message = {
        text: response.data.text,
        role: "bot",
        timestamp: new Date(),
      };

      // Update messages with the bot's response
      setMessages((prevMessages) => [...prevMessages, botMessage]);
    } catch (error: any) {
      console.error("Error during message sending:", error);
      
      // ✅ START: Optimized Error Handling
      // Check if the server sent back a specific 'details' message
      if (error.response && error.response.data && error.response.data.details) {
        setError(`Sorry, something went wrong: ${error.response.data.details}`);
      } else {
        // Fallback to a generic error
        setError("Sorry, something went wrong. Please try again.");
      }
      // ✅ END: Optimized Error Handling

      // Optional: Roll back optimistic update or show error inline
      // setMessages(messages); // This would remove the user's message
    } finally {
      setLoading(false);
    }
  };

  const handleThemeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    setTheme(e.target.value);
  };

  const getThemeColors = () => {
    switch (theme) {
      case "light":
        return {
          primary: "bg-white",
          secondary: "bg-gray-100",
          accent: "bg-blue-500",
          text: "text-gray-800",
        };
      case "dark":
      default:
        return {
          primary: "bg-gray-900",
          secondary: "bg-gray-800",
          accent: "bg-yellow-500",
          text: "text-gray-100",
        };
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Send message on Enter (but not Shift+Enter)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    } else if (e.key === 'Tab' && !e.shiftKey) {
      // Add tab indentation
      e.preventDefault();
      const { selectionStart, selectionEnd, value } = e.currentTarget;
      setUserInput(value.substring(0, selectionStart) + '  ' + value.substring(selectionEnd));
      // Move cursor after the inserted tab
      e.currentTarget.selectionStart = e.currentTarget.selectionEnd = selectionStart + 2;
    }
  };

  const { primary, secondary, accent, text } = getThemeColors();

  const TypingIndicator = () => (
    <div className="flex items-center p-2">
      <img src="/Genie.png" alt="Genie is thinking" className="w-10 h-10 mr-2" />
      <div className="flex items-center justify-center space-x-1">
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse"></div>
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:0.2s]"></div>
        <div className="w-2 h-2 bg-gray-400 rounded-full animate-pulse [animation-delay:0.4s]"></div>
      </div>
    </div>
  );

  return (
    <div className={`flex flex-col h-screen p-4 ${primary} ${text}`}>
      <header className="flex justify-between items-center mb-4">
        <h1 className="text-3xl font-bold">Genie Code</h1>
        <div className="flex space-x-2 items-center">
          <label htmlFor="theme" className="text-sm">
            Theme:
          </label>
          <select
            id="theme"
            value={theme}
            onChange={handleThemeChange}
            className={`p-1 rounded-md border ${primary} ${text} border-gray-500`}
          >
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>
      </header>

      <main className={`flex-grow overflow-y-auto rounded-md p-2 ${secondary} ${text}`}>
        {showGreeting && <p className="text-lg font-medium mb-4">{GREETING_MESSAGE}</p>}

        {messages.map((msg, index) => (
          <div
            key={index}
            className={`mb-4 rounded-lg shadow-md ${
              msg.role === "user" ? `${accent} text-white` : theme === "light" ? "bg-green-100 text-black" : "bg-white text-black"
            }`}
          >
            <div className="p-3 break-words">
              {msg.role === "bot" ? (
                <ReactMarkdown
                  components={{
                    // ✅ FIXED: This logic now correctly differentiates
                    // between fenced code blocks (with language) and
                    // inline code.
                    code({ node, className, children, ...props }) {
                      const match = /language-(\w+)/.exec(className || '');
                      const codeString = String(children).replace(/\n$/, '');
                      
                      // If 'match' exists, it's a fenced code block
                      return match ? (
                        <CodeBlock
                          codeString={codeString}
                          language={match[1]} // e.g., "tsx", "css"
                        />
                      ) : (
                        // Otherwise, it's inline code (e.g., `useState`)
                        <code className={className} {...props}>
                          {children}
                        </code>
                      );
                    },
                  }}
                >
                  {msg.text}
                </ReactMarkdown>
              ) : (
                // ✅ CHANGED: Use `whitespace-pre-wrap` to preserve
                // newlines from the textarea, which is cleaner
                // than splitting and mapping.
                <p className="whitespace-pre-wrap font-sans">{msg.text}</p>
              )}
            </div>
            <p className={`text-xs ${msg.role === "user" ? "text-white/70" : "text-black/70"} mt-1 px-3 pb-2 flex items-center`}>
              {msg.role === "user" ? <FaceIcon className="mr-1" /> : <CodeSandboxLogoIcon className="mr-1" />}
              {msg.role === "bot" ? "Genie" : "You"} - {msg.timestamp.toLocaleString()}
            </p>
          </div>
        ))}

        {loading && <TypingIndicator />}
        {error && <p className="text-red-500 p-2">{error}</p>}
      </main>

      <footer className="flex items-center mt-4">
        <textarea
          rows={3}
          placeholder="Write clear and concise instructions for the code... (Shift+Enter for new line)"
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={handleKeyPress}
          className={`flex-1 resize-none p-2 rounded-l-md border border-gray-300 focus:outline-none focus:border-${accent} ${secondary} ${text}`}
        />
        <button
          onClick={handleSendMessage}
          disabled={loading || !userInput.trim()}
          className={`p-2 ${accent} text-white rounded-r-md hover:bg-opacity-80 focus:outline-none disabled:opacity-50`}
        >
          Send
        </button>
      </footer>
    </div>
  );
}
  
  
  
  
