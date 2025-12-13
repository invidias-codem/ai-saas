"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";
import { 
  CodeIcon, 
  LightningBoltIcon,
  CheckIcon,
} from "@radix-ui/react-icons";
import { Slack, MessageSquare, Bot, Zap, Shield, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const SlackLandingPage = () => {
  // Redirect through our auth endpoint which handles the OAuth flow server-side
  // This ensures the redirect_uri is constructed consistently
  const addToSlackUrl = '/api/integrations/slack/auth';

  return (
    <div className="bg-[#111827] min-h-screen flex flex-col overflow-x-hidden relative">
      
      {/* Background Gradients */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-[#4A154B]/30 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 py-6 px-6 md:px-10 flex justify-between items-center max-w-7xl mx-auto w-full">
        <Link href="/" className="flex items-center gap-2">
          <div className="relative w-8 h-8">
            <Image src="/Genie.png" alt="Genie Logo" fill className="object-cover" /> 
          </div>
          <span className="text-2xl font-bold text-white tracking-tight">Genie AI</span>
        </Link>
        <div className="flex items-center gap-x-2">
          <Link href="/support">
            <Button variant="ghost" className="text-gray-300 hover:text-white hover:bg-white/10 rounded-full hidden sm:inline-flex">
              Support
            </Button>
          </Link>
          <Link href="/sign-in">
            <Button variant="ghost" className="text-white hover:text-white hover:bg-white/10 rounded-full">
              Log in
            </Button>
          </Link>
          <Link href="/sign-up">
            <Button className="bg-white text-black hover:bg-gray-200 rounded-full font-semibold">
              Get Started
            </Button>
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex-grow">
        {/* Hero Section */}
        <section className="pt-16 pb-20 px-4 text-center space-y-8 max-w-4xl mx-auto">
          <div className="inline-flex items-center rounded-full border border-[#4A154B]/50 bg-[#4A154B]/20 px-4 py-2 text-sm text-white backdrop-blur-xl">
            <Slack className="w-4 h-4 mr-2" />
            Slack Integration
          </div>
          
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold text-white tracking-tight leading-[1.1]">
            Bring <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">Genie AI</span> to Your Slack Workspace
          </h1>
          
          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Get instant AI assistance right where your team works. Ask questions, generate code, 
            and boost productivity without leaving Slack.
          </p>
          
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4 pt-4">
            <Link href={addToSlackUrl} className="w-full sm:w-auto">
              <Button 
                size="lg" 
                className="w-full sm:w-auto bg-[#4A154B] hover:bg-[#3a1039] text-white rounded-xl text-lg px-8 py-6 shadow-lg shadow-purple-500/25 flex items-center justify-center gap-2"
              >
                <Slack className="w-5 h-5" />
                Add to Slack
              </Button>
            </Link>
            <Link href="/sign-up" className="w-full sm:w-auto">
              <Button 
                variant="outline" 
                size="lg"
                className="w-full sm:w-auto rounded-xl border-white/20 text-white hover:bg-white/10 px-8 py-6"
              >
                Try Web App First
              </Button>
            </Link>
          </div>
          
          <p className="text-sm text-gray-500">
            Free to use • No credit card required • Works with any Slack workspace
          </p>
        </section>

        {/* How It Works */}
        <section className="px-4 pb-20 max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">How It Works</h2>
            <p className="text-gray-400">Get started in under a minute</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="text-center">
                <div className="w-12 h-12 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 flex items-center justify-center text-white font-bold text-xl mx-auto mb-4">
                  {index + 1}
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{step.title}</h3>
                <p className="text-gray-400 text-sm">{step.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Features Grid */}
        <section className="px-4 pb-20 max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">Powerful Features in Slack</h2>
            <p className="text-gray-400">Everything you need to supercharge your team&apos;s productivity</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-4">
            {features.map((feature) => (
              <div 
                key={feature.label} 
                className="group p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition duration-200 backdrop-blur-sm"
              >
                <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center mb-4 transition-transform group-hover:scale-110", feature.bgColor)}>
                  <feature.icon className={cn("w-6 h-6", feature.color)} />
                </div>
                <h3 className="text-xl font-semibold text-white mb-2">{feature.label}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Commands Section */}
        <section className="py-20 border-t border-white/10 bg-black/20">
          <div className="max-w-4xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-white mb-4">Slash Commands</h2>
              <p className="text-gray-400">Quick access to AI assistance with simple commands</p>
            </div>
            
            <div className="bg-[#1a1f2e] rounded-2xl border border-white/10 overflow-hidden">
              <div className="p-4 border-b border-white/10 flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-gray-400 text-sm ml-2">Slack</span>
              </div>
              <div className="p-6 space-y-4 font-mono text-sm">
                {commands.map((cmd, index) => (
                  <div key={index} className="flex items-start gap-4">
                    <code className="text-purple-400 whitespace-nowrap">{cmd.command}</code>
                    <span className="text-gray-500">—</span>
                    <span className="text-gray-300">{cmd.description}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Security Section */}
        <section className="py-20 px-4">
          <div className="max-w-4xl mx-auto text-center">
            <Shield className="w-12 h-12 text-green-400 mx-auto mb-6" />
            <h2 className="text-3xl font-bold text-white mb-4">Enterprise-Grade Security</h2>
            <p className="text-gray-400 mb-8 max-w-2xl mx-auto">
              Your data is protected with industry-leading security practices. 
              We never store your Slack messages or use them to train AI models.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {securityFeatures.map((feature, index) => (
                <div key={index} className="p-4 rounded-xl bg-white/5 border border-white/10">
                  <CheckIcon className="w-5 h-5 text-green-400 mx-auto mb-2" />
                  <p className="text-white font-medium">{feature}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-20 px-4 border-t border-white/10">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-bold text-white mb-4">Ready to Get Started?</h2>
            <p className="text-gray-400 mb-8">
              Add Genie AI to your Slack workspace and start boosting your team&apos;s productivity today.
            </p>
            <Link href={addToSlackUrl}>
              <Button 
                size="lg" 
                className="bg-[#4A154B] hover:bg-[#3a1039] text-white rounded-xl text-lg px-10 py-6 shadow-lg"
              >
                <Slack className="w-5 h-5 mr-2" />
                Add to Slack — It&apos;s Free
              </Button>
            </Link>
          </div>
        </section>
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
              <Link href="/support" className="hover:text-white transition">Support</Link>
              <Link href="/" className="hover:text-white transition">Home</Link>
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
};

export default SlackLandingPage;

// --- Data ---

const steps = [
  {
    title: "Add to Slack",
    description: "Click the button above to authorize Genie AI in your workspace.",
  },
  {
    title: "Invite to Channels",
    description: "Add @Genie to any channel where you want AI assistance.",
  },
  {
    title: "Start Chatting",
    description: "Use /genie commands or @mention Genie to get instant help.",
  },
];

const features = [
  {
    label: "Slash Commands",
    icon: Zap,
    description: "Quick access to AI with /genie ask, /genie code, /genie explain, and more.",
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
  },
  {
    label: "@Mentions",
    icon: Bot,
    description: "Mention @Genie in any channel to get contextual AI assistance.",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
  {
    label: "Direct Messages",
    icon: MessageSquare,
    description: "Private conversations with Genie for sensitive questions.",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  {
    label: "Code Generation",
    icon: CodeIcon,
    description: "Generate, debug, and explain code in any programming language.",
    color: "text-green-400",
    bgColor: "bg-green-500/10",
  },
  {
    label: "Instant Responses",
    icon: LightningBoltIcon,
    description: "Get AI responses in seconds, right in your Slack conversation.",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
  },
  {
    label: "Team Collaboration",
    icon: Users,
    description: "Share AI responses with your team in public channels.",
    color: "text-pink-500",
    bgColor: "bg-pink-500/10",
  },
];

const commands = [
  { command: "/genie help", description: "Show all available commands" },
  { command: "/genie ask [question]", description: "Ask Genie anything" },
  { command: "/genie code [request]", description: "Generate or debug code" },
  { command: "/genie explain [topic]", description: "Get a clear explanation" },
  { command: "/genie summarize [text]", description: "Summarize long content" },
];

const securityFeatures = [
  "SOC 2 Compliant Infrastructure",
  "End-to-End Encryption",
  "No Message Storage",
  "GDPR Compliant",
  "Regular Security Audits",
  "OAuth 2.0 Authentication",
];
