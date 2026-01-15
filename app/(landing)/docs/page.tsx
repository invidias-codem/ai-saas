"use client";

import Link from "next/link";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
    BookOpen,
    Bot,
    Database,
    MessageSquare,
    Slack,
    Zap,
    ArrowRight,
    Code
} from "lucide-react";

export default function DocsPage() {
    return (
        <div className="bg-[#111827] min-h-screen flex flex-col overflow-x-hidden relative text-white">

            {/* Background Gradients */}
            <div className="fixed inset-0 z-0 pointer-events-none">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-purple-600/10 rounded-full blur-[100px]" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-[100px]" />
            </div>

            {/* Header */}
            <header className="relative z-10 py-6 px-6 md:px-10 flex justify-between items-center max-w-7xl mx-auto w-full border-b border-white/5 bg-[#111827]/80 backdrop-blur-md sticky top-0">
                <Link href="/" className="flex items-center gap-2">
                    <div className="relative w-8 h-8">
                        <Image src="/Genie.png" alt="Genie Logo" fill className="object-cover" />
                    </div>
                    <span className="text-2xl font-bold tracking-tight">Genie AI</span>
                </Link>
                <div className="flex items-center gap-x-4">
                    <Link href="/support" className="text-sm text-gray-400 hover:text-white transition hidden sm:block">
                        Support
                    </Link>
                    <Link href="/dashboard">
                        <Button variant="ghost" className="text-white hover:text-white hover:bg-white/10 rounded-full">
                            Log in
                        </Button>
                    </Link>
                    <Link href="/dashboard">
                        <Button className="bg-white text-black hover:bg-gray-200 rounded-full font-semibold">
                            Get Started
                        </Button>
                    </Link>
                </div>
            </header>

            <main className="relative z-10 max-w-7xl mx-auto w-full px-6 py-12 flex flex-col md:flex-row gap-12">
                {/* Sidebar Navigation */}
                <aside className="w-full md:w-64 flex-shrink-0 hidden md:block">
                    <div className="sticky top-32 space-y-8">
                        <div>
                            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Getting Started</h3>
                            <ul className="space-y-3 border-l border-white/10">
                                <li>
                                    <a href="#welcome" className="block pl-4 text-purple-400 border-l border-purple-400 -ml-px">Introduction</a>
                                </li>
                                <li>
                                    <a href="#features" className="block pl-4 text-gray-400 hover:text-white transition">Core Features</a>
                                </li>
                                <li>
                                    <a href="#first-steps" className="block pl-4 text-gray-400 hover:text-white transition">First Steps</a>
                                </li>
                            </ul>
                        </div>

                        <div>
                            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Integrations</h3>
                            <ul className="space-y-3 border-l border-white/10">
                                <li>
                                    <a href="#slack" className="block pl-4 text-gray-400 hover:text-white transition">Slack</a>
                                </li>
                            </ul>
                        </div>
                        <div>
                            <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">Resources</h3>
                            <ul className="space-y-3 border-l border-white/10">
                                <li>
                                    <Link href="/support" className="block pl-4 text-gray-400 hover:text-white transition">Support</Link>
                                </li>
                            </ul>
                        </div>
                    </div>
                </aside>

                {/* Content */}
                <div className="flex-grow max-w-3xl space-y-16">

                    {/* Welcome Section */}
                    <section id="welcome" className="scroll-mt-32">
                        <div className="inline-flex items-center rounded-full border border-purple-500/50 bg-purple-500/20 px-3 py-1 text-xs text-purple-200 mb-6">
                            <BookOpen className="w-3 h-3 mr-2" />
                            Documentation
                        </div>
                        <h1 className="text-4xl md:text-5xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-white to-gray-500">
                            Welcome to Genie AI
                        </h1>
                        <p className="text-xl text-gray-400 leading-relaxed mb-8">
                            Genie is your intelligent AI companion designed to streamline your workflow, manage knowledge, and integrate seamlessly with your favorite tools like Slack.
                        </p>
                        <div className="grid sm:grid-cols-2 gap-4">
                            <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                                <Bot className="w-8 h-8 text-blue-400 mb-4" />
                                <h3 className="text-lg font-semibold mb-2">AI Assistant</h3>
                                <p className="text-sm text-gray-400">Powered by Gemini 2.0 Flash for instant, accurate responses.</p>
                            </div>
                            <div className="p-6 rounded-2xl bg-white/5 border border-white/10">
                                <Database className="w-8 h-8 text-purple-400 mb-4" />
                                <h3 className="text-lg font-semibold mb-2">Memory Bank</h3>
                                <p className="text-sm text-gray-400">Genie remembers your preferences and past conversations.</p>
                            </div>
                        </div>
                    </section>

                    {/* Core Features */}
                    <section id="features" className="scroll-mt-32 border-t border-white/10 pt-16">
                        <h2 className="text-3xl font-bold mb-8">Core Features</h2>

                        <div className="space-y-12">
                            <div className="flex gap-6">
                                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center">
                                    <Zap className="w-6 h-6 text-blue-400" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-semibold mb-3">RAG (Retrieval-Augmented Generation)</h3>
                                    <p className="text-gray-400 leading-relaxed">
                                        Genie doesn't just guess. It retrieves relevant information from your stored documents and past conversations to provide grounded, factual answers.
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-6">
                                <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                                    <Database className="w-6 h-6 text-purple-400" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-semibold mb-3">Long-Term Memory</h3>
                                    <p className="text-gray-400 leading-relaxed">
                                        Unlike standard chatbots, Genie maintains a long-term memory of your interactions. It learns your coding style, project details, and preferences over time.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* First Steps */}
                    <section id="first-steps" className="scroll-mt-32 border-t border-white/10 pt-16">
                        <h2 className="text-3xl font-bold mb-8">First Steps</h2>

                        <div className="relative pl-8 space-y-12 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-white/10">

                            <div className="relative">
                                <div className="absolute -left-[41px] w-6 h-6 rounded-full bg-blue-500 border-4 border-[#111827] z-10" />
                                <h3 className="text-xl font-semibold mb-4">1. Create an Account</h3>
                                <p className="text-gray-400 mb-4">
                                    Sign up for a free account to get started. You'll get access to the dashboard where you can manage your settings and view your conversation history.
                                </p>
                                <Link href="/dashboard">
                                    <Button variant="outline" className="border-white/20 hover:bg-white/5">
                                        Sign Up Now <ArrowRight className="w-4 h-4 ml-2" />
                                    </Button>
                                </Link>
                            </div>

                            <div className="relative">
                                <div className="absolute -left-[41px] w-6 h-6 rounded-full bg-purple-500 border-4 border-[#111827] z-10" />
                                <h3 className="text-xl font-semibold mb-4">2. Start a Conversation</h3>
                                <p className="text-gray-400">
                                    Head to the chat interface and ask Genie anything. Try asking for code snippets, explanations of complex topics, or just chat casually.
                                </p>
                            </div>

                        </div>
                    </section>

                    {/* Slack Integration */}
                    <section id="slack" className="scroll-mt-32 border-t border-white/10 pt-16">
                        <div className="flex items-center gap-4 mb-8">
                            <div className="p-3 bg-white/10 rounded-lg">
                                <Slack className="w-8 h-8 text-white" />
                            </div>
                            <h2 className="text-3xl font-bold">Slack Integration</h2>
                        </div>

                        <div className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 border border-white/10 rounded-2xl p-8">
                            <h3 className="text-xl font-semibold mb-4">Bring Genie to your Team</h3>
                            <p className="text-gray-400 mb-6 leading-relaxed">
                                Seamlessly integrate Genie into your Slack workspace. Use <code className="bg-white/10 px-2 py-1 rounded text-purple-300">/genie</code> commands to ask questions, generate code, or summarize threads without leaving Slack.
                            </p>
                            <div className="space-y-4 mb-8">
                                <div className="flex items-start gap-3">
                                    <div className="mt-1 w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-xs">✓</div>
                                    <span className="text-sm text-gray-300">Answer technical questions instantly</span>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="mt-1 w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-xs">✓</div>
                                    <span className="text-sm text-gray-300">Summarize long conversation threads</span>
                                </div>
                                <div className="flex items-start gap-3">
                                    <div className="mt-1 w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center text-green-400 text-xs">✓</div>
                                    <span className="text-sm text-gray-300">Multi-tenant support for secure data isolation</span>
                                </div>
                            </div>
                            <Link href="/slack">
                                <Button className="bg-white text-black hover:bg-gray-200">
                                    Connect to Slack
                                </Button>
                            </Link>
                        </div>
                    </section>

                    {/* Need Help? */}
                    <section className="border-t border-white/10 pt-16 pb-16">
                        <div className="rounded-2xl bg-blue-600/10 border border-blue-500/20 p-8 text-center">
                            <h2 className="text-2xl font-bold mb-4">Still have questions?</h2>
                            <p className="text-gray-400 mb-8 max-w-lg mx-auto">
                                Our support team is always ready to help you with any issues or questions you might have.
                            </p>
                            <Link href="/support">
                                <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                                    Contact Support
                                </Button>
                            </Link>
                        </div>
                    </section>

                </div>
            </main>

            {/* Footer */}
            <footer className="py-10 border-t border-white/10 bg-[#111827]">
                <div className="max-w-7xl mx-auto px-6">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-6">
                        <div className="flex items-center gap-2">
                            <div className="relative w-6 h-6">
                                <Image src="/Genie.png" alt="Genie Logo" fill className="object-cover" />
                            </div>
                            <span className="text-lg font-bold text-white">Genie AI</span>
                        </div>

                        <div className="flex items-center gap-6 text-sm text-gray-400">
                            <Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link>
                            <Link href="/slack" className="hover:text-white transition">Slack Integration</Link>
                            <Link href="/support" className="hover:text-white transition">Support</Link>
                        </div>
                    </div>

                    <div className="mt-8 pt-8 border-t border-white/10 text-center">
                        <p className="text-gray-500 text-sm">
                            © {new Date().getFullYear()} Genie AI. All rights reserved.
                        </p>
                    </div>
                </div>
            </footer>
        </div>
    );
}
