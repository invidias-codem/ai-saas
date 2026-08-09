"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";
import {
  CodeIcon,
  LightningBoltIcon,
  CheckIcon,
} from "@radix-ui/react-icons";
import { Slack, MessageSquare, Bot, Zap, Shield, Users, ImageIcon, Presentation, Calendar, ArrowRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

const SlackLandingPage = () => {
  const addToSlackUrl = '/api/integrations/slack/auth';

  return (
    <div className="bg-black min-h-screen flex flex-col overflow-x-hidden relative">

      {/* Background Gradients - Manus-inspired */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-purple-600/20 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[600px] h-[600px] bg-blue-600/20 rounded-full blur-[120px]" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] bg-[#4A154B]/10 rounded-full blur-[100px]" />
      </div>

      {/* Header */}
      {/* Header Removed - Using Global Navbar */}

      <main className="relative z-10 flex-grow">
        {/* Hero Section */}
        <section className="pt-20 pb-24 px-4 text-center space-y-10 max-w-5xl mx-auto">
          <div className="inline-flex items-center rounded-full border border-purple-500/30 bg-purple-500/10 px-5 py-2.5 text-sm text-white backdrop-blur-xl">
            <Sparkles className="w-4 h-4 mr-2 text-purple-400" />
            Now with Image, Slides & Calendar
          </div>

          <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold text-white tracking-tight leading-[1.05]">
            From Slack Discussion to<br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-blue-500">
              Finished Deliverable
            </span>
            <br />in Minutes
          </h1>

          <p className="text-xl sm:text-2xl text-gray-300 max-w-3xl mx-auto leading-relaxed font-light">
            AI-powered image generation, slide decks, and calendar scheduling—directly from your Slack conversations.
          </p>

          <div className="flex flex-col sm:flex-row justify-center items-center gap-4 pt-6">
            <Link href={addToSlackUrl} className="w-full sm:w-auto">
              <Button
                size="lg"
                className="w-full sm:w-auto bg-white hover:bg-gray-100 text-black rounded-xl text-lg px-10 py-7 shadow-2xl shadow-purple-500/30 flex items-center justify-center gap-3 font-semibold"
              >
                <Slack className="w-6 h-6" />
                Connect to Slack
              </Button>
            </Link>
            <Link href="#features" className="w-full sm:w-auto">
              <Button
                variant="outline"
                size="lg"
                className="w-full sm:w-auto rounded-xl border-white/20 text-white hover:bg-white/10 px-10 py-7 backdrop-blur-sm"
              >
                See How It Works
                <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
          </div>

          <p className="text-sm text-gray-500">
            Free to use • No credit card required • Works with any Slack workspace
          </p>
        </section>

        {/* Competitive Comparison - Manus-inspired */}
        <section className="py-20 px-4 border-y border-white/10 bg-gradient-to-b from-transparent via-purple-950/10 to-transparent">
          <div className="max-w-6xl mx-auto">
            <div className="text-center mb-16">
              <h2 className="text-4xl font-bold text-white mb-4">Why Teams Choose Lattice OS</h2>
              <p className="text-gray-400 text-lg">More features, better performance, unbeatable value</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-blue-600/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all" />
                <div className="relative p-8 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
                  <div className="text-5xl font-bold text-white mb-2">Free to start</div>
                  <div className="text-gray-400 mb-4">Welcome credits, then pay-as-you-go</div>
                  <div className="text-sm text-gray-500">Start free — buy credits only when you need more</div>
                </div>
              </div>

              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-pink-600/20 to-purple-600/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all" />
                <div className="relative p-8 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
                  <div className="text-5xl font-bold text-white mb-2">4+</div>
                  <div className="text-gray-400 mb-4">Core Features</div>
                  <div className="text-sm text-gray-500">Images, Slides, Calendar + Code Assistant</div>
                </div>
              </div>

              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-2xl blur-xl group-hover:blur-2xl transition-all" />
                <div className="relative p-8 rounded-2xl border border-white/10 bg-black/50 backdrop-blur-xl">
                  <div className="text-5xl font-bold text-white mb-2">Pay-as-you-go</div>
                  <div className="text-gray-400 mb-4">No subscriptions</div>
                  <div className="text-sm text-gray-500">Credits, not monthly caps — use what you need</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Ways to Use - Manus-inspired with time savings */}
        <section id="features" className="py-24 px-4 max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Ways to Use Lattice OS in Slack</h2>
            <p className="text-gray-400 text-lg">Transform hours of work into minutes</p>
          </div>

          <div className="space-y-24">
            {useCases.map((useCase, index) => (
              <div
                key={index}
                className={cn(
                  "grid grid-cols-1 lg:grid-cols-2 gap-12 items-center",
                  index % 2 === 1 && "lg:grid-flow-dense"
                )}
              >
                <div className={cn("space-y-6", index % 2 === 1 && "lg:col-start-2")}>
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-600/20 to-blue-600/20 border border-purple-500/30">
                    <useCase.icon className="w-5 h-5 text-purple-400" />
                    <span className="text-sm text-purple-300 font-medium">{useCase.category}</span>
                  </div>

                  <h3 className="text-3xl font-bold text-white">{useCase.title}</h3>

                  <div className="flex items-baseline gap-4">
                    <div className="text-gray-500">
                      <div className="text-sm uppercase tracking-wide mb-1">Before</div>
                      <div className="text-2xl font-bold line-through">{useCase.before}</div>
                    </div>
                    <ArrowRight className="w-6 h-6 text-purple-400" />
                    <div className="text-white">
                      <div className="text-sm uppercase tracking-wide mb-1 text-purple-400">After</div>
                      <div className="text-3xl font-bold bg-gradient-to-r from-purple-400 to-pink-500 text-transparent bg-clip-text">
                        {useCase.after}
                      </div>
                    </div>
                  </div>

                  <p className="text-gray-400 text-lg leading-relaxed">{useCase.description}</p>

                  <div className="pt-4">
                    <code className="text-sm text-purple-400 bg-purple-950/30 px-4 py-2 rounded-lg border border-purple-500/20">
                      {useCase.example}
                    </code>
                  </div>
                </div>

                <div className={cn(
                  "relative group",
                  index % 2 === 1 && "lg:col-start-1 lg:row-start-1"
                )}>
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-600/20 to-blue-600/20 rounded-3xl blur-2xl group-hover:blur-3xl transition-all" />
                  <div className="relative aspect-[3/2] lg:aspect-[5/3] rounded-2xl border border-white/10 bg-gradient-to-br from-gray-900 to-black overflow-hidden">
                    {useCase.title === 'Image Generation' ? (
                      <video
                        className="w-full h-full object-cover"
                        src="/videos/slack-image-gen.mp4"
                        autoPlay
                        loop
                        muted
                        playsInline
                        controls={false}
                      />
                    ) : (
                      <>
                        <div className="absolute inset-0 flex items-center justify-center">
                          <useCase.icon className="w-24 h-24 text-white/10" />
                        </div>
                        <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black to-transparent">
                          <div className="text-white font-semibold">{useCase.title}</div>
                          <div className="text-gray-400 text-sm">{useCase.category}</div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* How It Works */}
        <section className="px-4 py-20 max-w-5xl mx-auto border-t border-white/10">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Get Started in 60 Seconds</h2>
            <p className="text-gray-400 text-lg">Three simple steps to transform your Slack workspace</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="text-center group">
                <div className="relative mb-6">
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-600/30 to-blue-600/30 rounded-full blur-xl group-hover:blur-2xl transition-all" />
                  <div className="relative w-16 h-16 rounded-full bg-gradient-to-r from-purple-600 to-blue-600 flex items-center justify-center text-white font-bold text-2xl mx-auto">
                    {index + 1}
                  </div>
                </div>
                <h3 className="text-xl font-semibold text-white mb-3">{step.title}</h3>
                <p className="text-gray-400">{step.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* All Features Grid */}
        <section className="px-4 py-20 max-w-7xl mx-auto border-t border-white/10">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-white mb-4">Everything You Need</h2>
            <p className="text-gray-400 text-lg">Powerful AI capabilities, all in one integration</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {allFeatures.map((feature) => (
              <div
                key={feature.label}
                className="group p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition-all duration-300 backdrop-blur-sm hover:border-purple-500/30"
              >
                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform group-hover:scale-110", feature.bgColor)}>
                  <feature.icon className={cn("w-6 h-6", feature.color)} />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{feature.label}</h3>
                <p className="text-gray-400 text-sm leading-relaxed">
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Security Section */}
        <section className="py-20 px-4 border-t border-white/10">
          <div className="max-w-4xl mx-auto text-center">
            <Shield className="w-12 h-12 text-green-400 mx-auto mb-6" />
            <h2 className="text-4xl font-bold text-white mb-4">Enterprise-Grade Security</h2>
            <p className="text-gray-400 mb-12 max-w-2xl mx-auto text-lg">
              Your data is protected with industry-leading security practices.
              We never store your Slack messages or use them to train AI models.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {securityFeatures.map((feature, index) => (
                <div key={index} className="p-6 rounded-xl bg-white/5 border border-white/10 hover:border-green-500/30 transition-colors">
                  <CheckIcon className="w-6 h-6 text-green-400 mx-auto mb-3" />
                  <p className="text-white font-medium">{feature}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA */}
        <section className="py-24 px-4 border-t border-white/10 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-purple-600/10 via-pink-600/10 to-blue-600/10" />
          <div className="relative max-w-4xl mx-auto text-center">
            <h2 className="text-4xl sm:text-5xl font-bold text-white mb-6">
              Ready to Transform Your Workflow?
            </h2>
            <p className="text-gray-300 mb-10 text-xl max-w-2xl mx-auto">
              Join thousands of teams using Lattice OS to work smarter, not harder.
            </p>
            <Link href={addToSlackUrl}>
              <Button
                size="lg"
                className="bg-white hover:bg-gray-100 text-black rounded-xl text-lg px-12 py-8 shadow-2xl shadow-purple-500/30 font-semibold"
              >
                <Slack className="w-6 h-6 mr-3" />
                Add to Slack — It&apos;s Free
              </Button>
            </Link>
            <p className="text-gray-500 mt-6 text-sm">
              No credit card required • 2-minute setup • Cancel anytime
            </p>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-10 border-t border-white/10 bg-black relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-2">
              <div className="relative w-6 h-6">
                <Image src="/Genie.png" alt="Lattice OS" fill className="object-cover" />
              </div>
              <span className="text-lg font-bold text-white">Lattice OS</span>
            </div>

            <div className="flex items-center gap-6 text-sm text-gray-400">
              <Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link>
              <Link href="/support" className="hover:text-white transition">Support</Link>
              <Link href="/" className="hover:text-white transition">Home</Link>
              <Link href="/blog" className="hover:text-white transition">Blog</Link>
            </div>
          </div>

          <div className="mt-8 pt-8 border-t border-white/10 text-center">
            <p className="text-gray-500 text-sm">
              © {new Date().getFullYear()} Lattice OS. All rights reserved.
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
    title: "Connect to Slack",
    description: "Click the button to authorize Lattice OS in your workspace—takes 30 seconds.",
  },
  {
    title: "Invite to Channels",
    description: "Add @Genie to any channel where you want AI superpowers.",
  },
  {
    title: "Start Creating",
    description: "Mention @Genie to generate images, slides, schedule meetings, and more.",
  },
];

const useCases = [
  {
    category: "Visual Content",
    title: "Image Generation",
    before: "30 minutes",
    after: "30 seconds",
    description: "Generate professional images, logos, and graphics instantly using Flux AI. From concept to finished visual in seconds.",
    example: "@Genie generate a logo for our AI startup with purple and blue colors",
    icon: ImageIcon,
  },
  {
    category: "Presentations",
    title: "Slide Decks",
    before: "2 hours",
    after: "2 minutes",
    description: "Create professional PowerPoint presentations with AI-generated content, layouts, and design—ready to present.",
    example: "@Genie create a slide deck about our Q1 product roadmap",
    icon: Presentation,
  },
  {
    category: "Scheduling",
    title: "Calendar Events",
    before: "10 minutes",
    after: "10 seconds",
    description: "Schedule meetings with team members using @mentions. Automatically resolves Slack users to emails and creates calendar invites.",
    example: "@Genie schedule a sync with @alice and @bob tomorrow at 2pm",
    icon: Calendar,
  },
  {
    category: "Development",
    title: "Code Generation",
    before: "1 hour",
    after: "1 minute",
    description: "Write, debug, and explain code in any language. Get instant solutions without context switching.",
    example: "@Genie write a React component for a user profile card",
    icon: CodeIcon,
  },
];

const allFeatures = [
  {
    label: "Image Generation",
    icon: ImageIcon,
    description: "Create stunning visuals with Flux AI. Logos, graphics, illustrations—all from text prompts.",
    color: "text-pink-500",
    bgColor: "bg-pink-500/10",
  },
  {
    label: "Slide Decks",
    icon: Presentation,
    description: "Professional PowerPoint presentations generated from your topic. Complete with layouts and content.",
    color: "text-blue-500",
    bgColor: "bg-blue-500/10",
  },
  {
    label: "Calendar Scheduling",
    icon: Calendar,
    description: "Schedule meetings with @mentions. Automatic email resolution and Google Calendar integration.",
    color: "text-green-500",
    bgColor: "bg-green-500/10",
  },
  {
    label: "Code Assistant",
    icon: CodeIcon,
    description: "Generate, debug, and explain code in any programming language with context-aware responses.",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
  {
    label: "@Mentions",
    icon: Bot,
    description: "Mention @Genie in any channel for contextual AI assistance that understands your conversation.",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
  },
  {
    label: "Direct Messages",
    icon: MessageSquare,
    description: "Private conversations with Lattice OS for sensitive questions and personal assistance.",
    color: "text-cyan-500",
    bgColor: "bg-cyan-500/10",
  },
  {
    label: "Instant Responses",
    icon: LightningBoltIcon,
    description: "Get AI responses in seconds with streaming output. No waiting, no delays.",
    color: "text-yellow-500",
    bgColor: "bg-yellow-500/10",
  },
  {
    label: "Team Collaboration",
    icon: Users,
    description: "Share AI-generated content with your team in public channels for seamless collaboration.",
    color: "text-indigo-500",
    bgColor: "bg-indigo-500/10",
  },
  {
    label: "Smart Context",
    icon: Zap,
    description: "Lattice OS understands thread context, attached files, and links for more accurate responses.",
    color: "text-red-500",
    bgColor: "bg-red-500/10",
  },
];

const securityFeatures = [
  "SOC 2 Compliant",
  "End-to-End Encryption",
  "No Message Storage",
  "GDPR Compliant",
  "Regular Security Audits",
  "OAuth 2.0 Authentication",
];
