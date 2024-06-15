"use client";

import dotenv from 'dotenv';
import { useState, useEffect, SetStateAction } from "react";
import {  HarmCategory, HarmBlockThreshold, GoogleGenerativeAI, ChatSession } from "@google/generative-ai";
import { ClipboardIcon, CodeSandboxLogoIcon, FaceIcon, MoonIcon } from "@radix-ui/react-icons";
import { CopyToClipboard } from 'react-copy-to-clipboard';
dotenv.config();

export default function ConversationPage() {
    const [messages, setMessages] = useState<({ text: string; role: string; timestamp: Date; })[]>([]);
    const [userInput, setUserInput] = useState("");
    const [chat, setChat] = useState(null);
    const [theme, setTheme] = useState("dark");
    const [error, setError] = useState(null);
  
    const { GoogleGenerativeAI } = require("@google/generative-ai");
  
    // Access your API key as an environment variable (see "Set up your API key" above)
    const apiKey = process.env.API_KEY;
    const genAI = new GoogleGenerativeAI(apiKey);
  
    const mapMessageToHistory = (message: { text: any; role: any; }) => ({
      text: message.text,
      role: message.role,
    });
  
    const initializeChat = async () => {
      try {
        const model = await genAI.getGenerativeModel({ model: "gemini-pro" });
  
        const initialHistory = [
          {
            role: "user",
            parts: [{ text: "Hello, I would like to know as much as you can teach me." }],
          },
          {
            role: "model",
            parts: [{ text: "Sounds amazing, my name is Genie. Where should we begin this intellectual journey?" }],
          },
        ];
  
        const newChat = await model.startChat({
          history: initialHistory, // No need for map here
          generationConfig: {
            temperature: 0.9,
            topK: 40,
            topP: 0.7,
            maxOutputTokens: 2048,
          },
          safetySettings: [
            {
              category: HarmCategory.HARM_CATEGORY_HARASSMENT,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
            {
              category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
              threshold: HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE,
            },
          ],
        });
  
        setChat(newChat);
      } catch (error) {
        console.error("Error during chat initialization:", error);
      }
    };
  
    useEffect(() => {
      initializeChat(); // Initialize chat on component mount
    }, []);
  
    const handleSendMessage = async () => {
        if (!chat) return;
      
        setLoading(true); // Set loading state to true
      
        try {
          const userMessage = {
            text: userInput,
            role: "user",
            timestamp: new Date(),
          };
      
          setMessages((prevMessages) => [...prevMessages, userMessage]);
          setUserInput("");

          <TypingIndicator />
      
          const result = await (chat as YourChatType)?.sendMessage(userInput) || Promise.reject(new Error("Chat not initialized"));
          const botMessage = {
            text: result.response.text(),
            role: "bot",
            timestamp: new Date(),
          };
      
          setMessages((prevMessages) => [...prevMessages, botMessage]);
        } catch (error: any) {
          console.error("Error during message sending:", error);
        } finally {
          setLoading(false); // Set loading state to false regardless of success or failure
        }
      };
      
      const [loading, setLoading] = useState(false);
      
      
      

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
                return {
                    prmary: "bg-gray-900",
                    secondary: "bg-gray-800",
                    accent: "bg-yellow-500",
                };
            default:
                return {
                    primary: "bg-white",
                    secondary: "bg-gray-100",
                    acccent: "bg-yellow-500",
                    text: "text-gray-100",
                };
        }
    };

    const handleKeyPress = (e: {
      shiftKey: boolean; key: string; preventDefault: () => void; 
}) => {
      if (e.key === 'Enter' && e.shiftKey) {
        // Handle Shift+Enter: Create a new line
        setUserInput(userInput + '\n'); // Add a newline character to the user input
      } else if (e.key === 'Tab') {
        // Handle Tab: Indentation (replace with your desired indentation logic)
        e.preventDefault(); // Prevent default tab behavior (jumping focus)
        setUserInput(userInput + '  '); // Add two spaces for basic indentation
      } else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        // Handle Arrow Up/Down: Cursor movement (implement logic based on your needs)
        // This example does nothing for now, replace with cursor movement logic
      } else if (e.key === 'Enter') {
        // Handle Enter: Send message
        e.preventDefault(); // Prevent default form submission (if applicable)
        handleSendMessage();
      }
    };
    

    // Get the theme colors for the current theme
    const {primary, secondary, accent, text } = getThemeColors();


    // JSX for your conversation UI elements using messages, userInput, theme, and error states
  
    const GREETING_MESSAGE = "Hi there! What would you like to talk about today?";

    const TypingIndicator = () => (

      <div className="flex items-center justify-center mt-2">
      
      <div className="w-6 h-6 bg-gray-400 rounded-full animate-ping mr-2"></div>
      
      <div className="w-6 h-6 bg-gray-400 rounded-full animate-ping mr-2"></div>
      
      <div className="w-6 h-6 bg-gray-400 rounded-full animate-ping"></div>
      
      <img src="Genie.png" alt="Genie is thinking" className="w-10 h-10 ml-2" />
      
      </div>
);

return (
  <div className={`flex flex-col h-screen p-4 ${primary}`}>
    <header className="flex justify-between items-center mb-4">
      <h1 className={`text-3xl font-bold ${text}`}>Genie Chat</h1>
      <div className="flex space-x-2">
        <label htmlFor="theme" className={`text-sm ${text}`}>
          Theme:
        </label>
        <select
          id="theme"
          value={theme}
          onChange={handleThemeChange}
          className={`p-1 rounded-md border ${text}`}
        >
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </select>
      </div>
    </header>

    <main className={`flex-grow overflow-y-auto rounded-md p-2 ${secondary}`}>
      {/* Show greeting message initially (unchanged) */}
      {!messages?.length && <p className="text-lg font-medium mb-4">{GREETING_MESSAGE}</p>}
      {messages && messages.map((msg, index) => (
        <div
          key={index}
          className={`mb-4 rounded-lg shadow-md ${
            msg.role === "user" ? `${accent} text-white` : theme === "light" ? "bg-green-100 text-black" : "bg-white text-black"
          }`}
        >
          <span className="p-2 break-words">
            {msg.text.split('\n').map((line, i) => (
              <span key={i}>
                {line.startsWith('*') && <li>{line.slice(1)}</li>}
                {line.startsWith('```') && (
                  <pre className="bg-gray-200 rounded p-2">{line.slice(3)}</pre>
                )}
                {!line.startsWith('*') && !line.startsWith('```') && <p>{line}</p>}
              </span>
            ))}
          </span>
          <p className={`text-xs ${text} mt-1`}>
            {msg.role === "bot" ? "Genie" : "You"} - {msg.timestamp.toLocaleString()}
          </p>
        </div>
      ))}
      {/* Show typing bubbles before sending a bot message (unchanged) */}
    </main>

    <footer className="flex items-center mt-4">
      <textarea
        rows={3} // Adjust rows for desired initial height
        placeholder="Type your request here..."
        value={userInput}
        onChange={(e) => setUserInput(e.target.value)}
        onKeyDown={handleKeyPress} // Assuming handleKeyPress handles Shift+Enter
        className={`flex-1 resize-none p-2 rounded-md border border-gray-300 focus:outline-none focus:border-${accent}`}
      />
      <button
        onClick={handleSendMessage}
        className={`p-2 ${accent} text-white rounded-r-md hover:bg-opacity-80 focus:outline-none`}
      >
        Send
      </button>
    </footer>
  </div>
);


  }


