"use client";

import { useState, useRef, KeyboardEvent, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";
import Image from "next/image";
import { PaperPlaneIcon, ReloadIcon, PersonIcon } from "@radix-ui/react-icons";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Message {
    role: "user" | "bot";
    text: string;
}

type FeedbackRating = 1 | -1;

async function submitFeedback(params: {
    input: string;
    output: string;
    rating: FeedbackRating;
    source?: string;
    labels?: string[];
    metadata?: Record<string, any>;
}) {
    try {
        await fetch("/api/feedback", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                source: params.source ?? "web-guest",
                promptVersion: "landing-chat",
                model: "guest-chat",
                input: params.input,
                output: params.output,
                rating: params.rating,
                labels: params.labels ?? [],
                metadata: params.metadata ?? {},
            }),
        });
    } catch (e) {
        // Best-effort feedback capture; never block UI.
        console.warn("Failed to submit feedback", e);
    }
}

const STORAGE_KEY = "genie_guest_count";

export const LandingChat = () => {
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [interactionCount, setInteractionCount] = useState(0);
    const [limitReached, setLimitReached] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const chatContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Load interaction count from localStorage on mount
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            const count = parseInt(stored, 10);
            setInteractionCount(count);
            if (count >= 10) {
                setLimitReached(true);
            }
        }
    }, []);

    // No auto-scroll - let users scroll manually to read from the beginning

    const handleSendMessage = async () => {
        if (!input.trim() || isLoading || limitReached) return;

        const userMessage: Message = { role: "user", text: input.trim() };
        const updatedMessages = [...messages, userMessage];
        setMessages(updatedMessages);
        setInput("");
        setIsLoading(true);

        try {
            const response = await fetch("/api/guest-chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    messages: updatedMessages,
                    interactionCount
                }),
            });

            const data = await response.json();

            if (!response.ok) {
                if (data.requiresSignup) {
                    setLimitReached(true);
                    localStorage.setItem(STORAGE_KEY, "10");
                } else {
                    throw new Error(data.error || "Something went wrong");
                }
                return;
            }

            // Update messages with bot response
            setMessages([...updatedMessages, { role: "bot", text: data.text }]);

            // Update interaction count
            const newCount = interactionCount + 1;
            setInteractionCount(newCount);
            localStorage.setItem(STORAGE_KEY, newCount.toString());

            if (newCount >= 10) {
                setLimitReached(true);
            }
        } catch (error) {
            console.error("Guest chat error:", error);
            setMessages([
                ...updatedMessages,
                { role: "bot", text: "Oops! Something went wrong. Please try again." }
            ]);
        } finally {
            setIsLoading(false);
        }
    };

    const handleKeyPress = (e: KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    // Typing indicator - matching conversation page style
    const TypingIndicator = () => (
        <div className="flex gap-3 mb-6">
            <div className="flex-shrink-0 mt-1">
                <Avatar className="h-8 w-8 ring-1 ring-white/20 bg-[#1a1a2e]">
                    <AvatarImage src="/Genie.png" />
                    <AvatarFallback className="text-[10px] bg-gradient-to-br from-indigo-500 to-purple-500 text-white">AI</AvatarFallback>
                </Avatar>
            </div>
            <div className="flex items-center gap-1 px-2 py-2">
                <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                        <div
                            key={i}
                            className="w-2 h-2 rounded-full bg-purple-400 animate-bounce"
                            style={{ animationDelay: `${i * 0.15}s` }}
                        />
                    ))}
                </div>
                <span className="text-sm text-gray-400 ml-2">Genie is thinking...</span>
            </div>
        </div>
    );

    // Limit reached CTA
    if (limitReached) {
        return (
            <div className="w-full max-w-2xl mx-auto">
                <div className="relative p-8 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl text-center">
                    <div className="absolute inset-0 bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-2xl" />
                    <div className="relative z-10">
                        <div className="text-4xl mb-4">✨</div>
                        <h3 className="text-xl font-semibold text-white mb-2">
                            You&apos;ve used your 10 free messages!
                        </h3>
                        <p className="text-gray-400 mb-6">
                            Sign up to continue chatting with Genie and unlock unlimited conversations, memory features, and more.
                        </p>
                        <div className="flex flex-col sm:flex-row gap-3 justify-center">
                            <Link href="/dashboard">
                                <Button className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-full px-8 py-5 font-semibold w-full sm:w-auto">
                                    Sign Up Free
                                </Button>
                            </Link>
                            <Link href="/dashboard">
                                <Button variant="outline" className="rounded-full px-8 py-5 border-white/20 text-white hover:bg-white/10 w-full sm:w-auto">
                                    Log In
                                </Button>
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="w-full max-w-2xl mx-auto px-4 md:px-6">
            {/* New Year CTA Header */}
            <div className="text-center mb-4">
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30 mb-3">
                    <span className="text-lg">🎇</span>
                    <span className="text-white font-medium">New Year, New Project</span>
                </div>
                <p className="text-gray-400 text-sm mb-6">Ask Genie anything to get started</p>

                {messages.length === 0 && (
                    <div className="flex flex-wrap justify-center gap-2 max-w-lg mx-auto mb-6">
                        {[
                            "Explain quantum computing",
                            "Write a Python script for web scraping",
                            "Draft an email to a client",
                            "Generate a creative story about AI"
                        ].map((prompt) => (
                            <button
                                key={prompt}
                                onClick={() => {
                                    setInput(prompt);
                                    // Optional: auto-send
                                    // handleSendMessage(); 
                                }}
                                className="text-sm px-4 py-2.5 rounded-full border border-white/10 bg-white/5 hover:bg-white/10 active:bg-white/15 text-gray-300 transition-colors min-h-[44px] flex items-center justify-center"
                            >
                                {prompt}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* Chat Container */}
            <div className="relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl overflow-hidden">
                {/* Messages Area - Matching conversation page styling */}
                {messages.length > 0 && (
                    <div ref={chatContainerRef} className="max-h-[400px] md:max-h-[500px] overflow-y-auto p-6 md:p-8 scroll-smooth">
                        {messages.map((msg, idx) => (
                            <div
                                key={idx}
                                className={cn(
                                    "group w-full mb-8 md:mb-10 flex",
                                    msg.role === "user" ? "justify-end" : "justify-start"
                                )}
                            >
                                <div className={cn(
                                    "flex max-w-[90%] gap-3",
                                    msg.role === "user" ? "flex-row-reverse" : "flex-row"
                                )}>
                                    {/* Avatars - matching conversation page */}
                                    <div className="flex-shrink-0 mt-1">
                                        {msg.role === "bot" ? (
                                            <Avatar className="h-8 w-8 ring-1 ring-white/20 bg-[#1a1a2e]">
                                                <AvatarImage src="/Genie.png" />
                                                <AvatarFallback className="text-[10px] bg-gradient-to-br from-indigo-500 to-purple-500 text-white">AI</AvatarFallback>
                                            </Avatar>
                                        ) : (
                                            <div className="h-8 w-8 rounded-full bg-purple-500/20 flex items-center justify-center">
                                                <PersonIcon className="h-4 w-4 text-purple-400" />
                                            </div>
                                        )}
                                    </div>

                                    {/* Content Bubble - matching conversation page */}
                                    <div className={cn(
                                        "relative text-[15px] md:text-[16px] leading-relaxed md:leading-loose",
                                        msg.role === "user"
                                            ? "bg-white/10 text-white rounded-[20px] rounded-tr-sm px-5 py-3" // User bubble
                                            : "bg-transparent text-gray-200 px-0 py-0" // Bot - no bubble (Gemini style)
                                    )}>
                                        {msg.role === "bot" ? (
                                            <ReactMarkdown
                                                remarkPlugins={[remarkGfm]}
                                                components={{
                                                    pre: ({ node, ...props }) => (
                                                        <div className="relative w-full overflow-hidden my-4 rounded-xl border border-white/10 bg-zinc-950 shadow-md">
                                                            <div className="flex items-center justify-between px-4 py-2 bg-zinc-900 border-b border-zinc-800">
                                                                <span className="text-xs text-zinc-400 font-mono">code</span>
                                                            </div>
                                                            <pre {...props} className="p-4 overflow-x-auto text-xs text-zinc-50 font-mono leading-relaxed" />
                                                        </div>
                                                    ),
                                                    code({ node, className, children, ...props }) {
                                                        const match = /language-(\w+)/.exec(className || '');
                                                        return match ? (
                                                            <code className={className} {...props}>{children}</code>
                                                        ) : (
                                                            <code className="bg-white/10 px-1.5 py-0.5 rounded-md font-mono text-[13px] text-pink-400" {...props}>{children}</code>
                                                        );
                                                    },
                                                    p: ({ node, ...props }) => <p {...props} className="mb-5 md:mb-6 last:mb-0 leading-relaxed" />,
                                                    ul: ({ node, ...props }) => <ul {...props} className="list-disc list-outside ml-4 mb-4 space-y-2 marker:text-gray-500" />,
                                                    ol: ({ node, ...props }) => <ol {...props} className="list-decimal list-outside ml-4 mb-4 space-y-2 marker:text-gray-500" />,
                                                    li: ({ node, ...props }) => <li {...props} className="pl-1" />,
                                                    h1: ({ node, ...props }) => <h1 {...props} className="text-2xl font-semibold mb-4 mt-6 first:mt-0 tracking-tight text-white" />,
                                                    h2: ({ node, ...props }) => <h2 {...props} className="text-xl font-semibold mb-3 mt-5 tracking-tight text-white" />,
                                                    h3: ({ node, ...props }) => <h3 {...props} className="text-lg font-medium mb-2 mt-4 text-white" />,
                                                    blockquote: ({ node, ...props }) => <blockquote {...props} className="border-l-4 border-purple-500/40 pl-4 italic text-gray-400 my-4" />,
                                                    a: ({ node, ...props }) => <a {...props} className="text-purple-400 hover:text-purple-300 font-medium underline underline-offset-4 transition-colors" target="_blank" rel="noreferrer" />,
                                                    strong: ({ node, ...props }) => <strong {...props} className="font-semibold text-white" />,
                                                }}
                                            >
                                                {msg.text}
                                            </ReactMarkdown>
                                        ) : (
                                            <p className="whitespace-pre-wrap">{msg.text}</p>
                                        )}

                                        {/* Feedback controls for bot messages */}
                                        {msg.role === "bot" && idx > 0 && messages[idx - 1]?.role === "user" && (
                                            <div className="mt-3 flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                                                <button
                                                    type="button"
                                                    className="text-xs px-2 py-1 rounded-md border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
                                                    onClick={() =>
                                                        submitFeedback({
                                                            input: messages[idx - 1]?.text ?? "",
                                                            output: msg.text,
                                                            rating: 1,
                                                            labels: ["thumbs_up"],
                                                        })
                                                    }
                                                >
                                                    👍
                                                </button>
                                                <button
                                                    type="button"
                                                    className="text-xs px-2 py-1 rounded-md border border-white/10 bg-white/5 text-gray-300 hover:bg-white/10"
                                                    onClick={() =>
                                                        submitFeedback({
                                                            input: messages[idx - 1]?.text ?? "",
                                                            output: msg.text,
                                                            rating: -1,
                                                            labels: ["thumbs_down"],
                                                        })
                                                    }
                                                >
                                                    👎
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {isLoading && <TypingIndicator />}
                        <div ref={messagesEndRef} />
                    </div>
                )}

                {/* Input Area */}
                <div className="p-5 border-t border-white/10 bg-white/[0.02]">
                    <div className="flex items-end gap-2">
                        <textarea
                            ref={inputRef}
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={handleKeyPress}
                            placeholder="Ask Genie anything..."
                            disabled={isLoading}
                            rows={1}
                            className="flex-1 resize-none bg-white/10 border-2 border-white/20 rounded-xl px-4 py-3 text-white placeholder:text-gray-400 focus:outline-none focus:border-purple-500 focus:bg-white/15 disabled:opacity-50 transition-all duration-200"
                        />
                        <Button
                            onClick={handleSendMessage}
                            disabled={!input.trim() || isLoading}
                            className="bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-xl p-3 h-[46px] w-[46px]"
                        >
                            {isLoading ? (
                                <ReloadIcon className="w-4 h-4 animate-spin" />
                            ) : (
                                <PaperPlaneIcon className="w-4 h-4" />
                            )}
                        </Button>
                    </div>

                    {/* Interaction Counter */}
                    <div className="mt-3 flex justify-between items-center text-xs">
                        <span className="text-sm md:text-xs text-gray-400 font-medium">
                            {10 - interactionCount} of 10 free messages remaining
                        </span>
                        {interactionCount >= 8 && (
                            <span className="text-yellow-500 animate-pulse">
                                {interactionCount === 9 ? "Last free message!" : "Almost out of free messages"}
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
