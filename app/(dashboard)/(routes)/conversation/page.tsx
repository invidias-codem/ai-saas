"use client";

import { useState, SetStateAction } from "react";
// ‼ Removed all @google/generative-ai imports from the client
import axios from "axios"; // ✅ Import axios

// Define the message structure
interface Message {
  text: string;
  role: "user" | "bot";
  timestamp: Date;
}

export default function ConversationPage() {
    const [messages, setMessages] = useState<Message[]>([]);
    const [userInput, setUserInput] = useState("");
    const [theme, setTheme] = useState("dark");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ✅ State for the initial greeting
    const [showGreeting, setShowGreeting] = useState(true);

    const GREETING_MESSAGE = "Hi there! What would you like to talk about today?";

    // ‼ Removed initializeChat() and all genAI logic.
    // The server will handle the conversation history.

    const handleSendMessage = async () => {
        if (!userInput.trim()) return;
      
        setLoading(true);
        setError(null);
        setShowGreeting(false); // Hide greeting on first message
      
        const userMessage: Message = {
          text: userInput,
          role: "user",
          timestamp: new Date(),
        };
      
        // ✅ Add user message and clear input
        const newMessages = [...messages, userMessage];
        setMessages(newMessages);
        setUserInput("");
      
        try {
          // ✅ Send the *entire* message history to your backend API
          const response = await axios.post("/api/conversation", {
            // Pass history in the format your API route expects
            messages: newMessages.map(msg => ({
              role: msg.role,
              text: msg.text
            }))
          });
      
          const botMessage: Message = {
            text: response.data.text, // Get text from API response
            role: "bot",
            timestamp: new Date(),
          };
      
          setMessages((prevMessages) => [...prevMessages, botMessage]);
        } catch (error: any) {
          console.error("Error during message sending:", error);
          setError("Sorry, something went wrong. Please try again.");
          // Optionally remove the user's message if the API call failed
          // setMessages(messages); 
        } finally {
          setLoading(false);
        }
      };

    // Handle Theme change
    const handleThemeChange = (e: { target: { value: SetStateAction<string>; }; }) => {
        setTheme(e.target.value);
    };

    // Get the theme colors based on the theme state
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
                    primary: "bg-gray-900", // Corrected 'prmary' to 'primary'
                    secondary: "bg-gray-800",
                    accent: "bg-yellow-500",
                    text: "text-gray-100", // Added missing 'text' for default
                };
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
      } else if (e.key === 'Tab' && !e.shiftKey) {
        e.preventDefault(); 
        setUserInput(userInput + '  ');
      }
    };
    
    const {primary, secondary, accent, text } = getThemeColors();

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
      <h1 className="text-3xl font-bold">Genie Chat</h1>
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
          className={`mb-4 rounded-lg shadow-md p-3 ${
            msg.role === "user" ? `${accent} text-white` : theme === "light" ? "bg-green-100 text-black" : "bg-white text-black"
          }`}
        >
          <div className="break-words">
            {msg.text.split('\n').map((line, i) => (
              <p key={i}>{line || <br />}</p> // Render empty lines
            ))}
          </div>
          <p className={`text-xs ${msg.role === "user" ? "text-white/70" : "text-black/70"} mt-2`}>
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
        placeholder="Type your request here... (Shift+Enter for new line)"
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


