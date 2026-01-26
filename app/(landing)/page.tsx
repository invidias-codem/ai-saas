"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";
import {
  ChatBubbleIcon,
  CodeIcon,
  DiscIcon,
  ImageIcon,
  VideoIcon,
  RocketIcon,
  CheckIcon,
  Cross2Icon
} from "@radix-ui/react-icons";
import { cn } from "@/lib/utils";
import { HeroSection } from "@/components/landing/hero-section";
import { FeatureCard } from "@/components/landing/feature-card";
import { Testimonials } from "@/components/landing/testimonials";

const LandingPage = () => {
  const [isPricingOpen, setIsPricingOpen] = useState(false);

  return (
    <div className="bg-background min-h-screen flex flex-col overflow-x-hidden relative selection:bg-purple-500/30 selection:text-white">

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 py-4 px-4 md:px-10 flex justify-between items-center max-w-7xl mx-auto w-full transition-all duration-300 bg-background/50 backdrop-blur-lg border-b border-white/5">
        <div className="flex items-center gap-2">
          <div className="relative w-8 h-8">
            <Image src="/Genie.png" alt="Genie Logo" fill className="object-cover" />
          </div>
          <span className="text-xl font-bold text-white tracking-tight font-heading">Genie AI</span>
        </div>
        <div className="flex items-center gap-x-4">
          <div className="hidden md:flex items-center gap-4 mr-4 text-sm font-medium text-muted-foreground">
            <Link href="/blog" className="hover:text-white transition-colors">Blog</Link>
            <Link href="/slack" className="hover:text-white transition-colors">Slack</Link>
            <Link href="/support" className="hover:text-white transition-colors">Support</Link>
          </div>
          <Button
            onClick={() => setIsPricingOpen(true)}
            variant="ghost"
            className="text-muted-foreground hover:text-white hover:bg-white/5 rounded-full hidden sm:inline-flex"
          >
            Pricing
          </Button>

          <Link href="/dashboard">
            <Button variant="ghost" className="text-white hover:text-white hover:bg-white/5 rounded-full">
              Log in
            </Button>
          </Link>
          <Link href="/dashboard">
            <Button className="bg-white text-black hover:bg-gray-200 rounded-full font-semibold shadow-lg shadow-white/10 transition-transform hover:scale-105">
              Get Started
            </Button>
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex-grow pt-16">

        <HeroSection />

        {/* Features Grid */}
        <section className="px-4 py-32 max-w-7xl mx-auto relative cursor-default">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[500px] bg-indigo-500/10 rounded-full blur-[100px] -z-10" />

          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-5xl font-bold text-white mb-6 font-heading">Supercharge your creativity</h2>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Five powerful tools in one dashboard. Generate content faster than ever before.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-4">
            {features.map((feature, i) => (
              <FeatureCard
                key={feature.label}
                {...feature}
                delay={i * 0.1}
              />
            ))}
          </div>
        </section>

        <Testimonials />

        {/* Bottom CTA */}
        <section className="py-24 text-center px-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-purple-900/20 pointer-events-none" />
          <div className="max-w-3xl mx-auto relative z-10 space-y-8">
            <h2 className="text-4xl md:text-5xl font-bold text-white font-heading tracking-tight">
              Ready to create the impossible?
            </h2>
            <p className="text-xl text-muted-foreground">
              Join thousands of creators who are already pushing the boundaries of what's possible with AI.
            </p>
            <Link href="/dashboard">
              <Button size="lg" className="rounded-full px-10 py-8 text-lg bg-white text-black hover:bg-gray-200 mt-4 shadow-[0_0_40px_-10px_rgba(255,255,255,0.3)]">
                Start Generating For Free
              </Button>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-12 border-t border-white/10 bg-background relative z-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8 mb-12">
            <div className="flex items-center gap-2">
              <div className="relative w-8 h-8">
                <Image src="/Genie.png" alt="Genie Logo" fill className="object-cover" sizes="(max-width: 768px) 32px, 32px" />
              </div>
              <span className="text-xl font-bold text-white font-heading">Genie AI</span>
            </div>

            <div className="flex flex-wrap justify-center gap-8 text-sm text-gray-400">
              <Link href="/blog" className="hover:text-white transition-colors">Blog</Link>
              <Link href="/slack" className="hover:text-white transition-colors">Slack Integration</Link>
              <Link href="/support" className="hover:text-white transition-colors">Support</Link>
              <Link href="/privacy" className="hover:text-white transition-colors">Privacy Policy</Link>
            </div>

            <div className="flex gap-4">
              {/* Social icons placeholder */}
            </div>
          </div>



          <div className="pt-8 border-t border-white/5 text-center">
            <p className="text-gray-500 text-sm">
              © {new Date().getFullYear()} Genie AI. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* Pricing Modal */}
      {isPricingOpen && (
        <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={() => setIsPricingOpen(false)}
          />

          {/* Modal Content */}
          <div className="relative w-full max-w-lg bg-[#0f1117] border border-white/10 sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-10 fade-in duration-300">

            {/* Modal Header */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white font-heading">Flexible Pricing</h2>
                <p className="text-sm text-gray-400">Pay only for what you generate.</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsPricingOpen(false)}
                className="text-gray-400 hover:text-white rounded-full hover:bg-white/10"
              >
                <Cross2Icon className="w-5 h-5" />
              </Button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-6 overflow-y-auto space-y-4 custom-scrollbar">
              {pricingTiers.map((tier, index) => (
                <div
                  key={index}
                  className={cn(
                    "relative p-4 rounded-xl border cursor-pointer transition-all duration-300",
                    tier.popular
                      ? "border-purple-500 bg-purple-500/10 shadow-[0_0_20px_-5px_rgba(168,85,247,0.4)]"
                      : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20"
                  )}
                >
                  {tier.popular && (
                    <div className="absolute -top-3 right-4 px-2 py-0.5 bg-purple-600 text-white text-[10px] font-bold uppercase tracking-wide rounded-full shadow-lg">
                      Most Popular
                    </div>
                  )}
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="font-semibold text-white">{tier.name}</h3>
                    <div className="text-right">
                      <span className="text-lg font-bold text-white">{tier.price}</span>
                      <span className="text-xs text-gray-400 block">{tier.unit}</span>
                    </div>
                  </div>
                  <p className="text-sm text-gray-400 mb-3">{tier.description}</p>
                  <ul className="space-y-2">
                    {tier.features.map((feat, i) => (
                      <li key={i} className="flex items-center text-xs text-gray-300">
                        <CheckIcon className="w-3.5 h-3.5 mr-2 text-green-400" />
                        {feat}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* Modal Footer */}
            <div className="p-6 border-t border-white/10 bg-black/20 sm:rounded-b-2xl">
              <Link href="/dashboard" className="w-full">
                <Button className="w-full bg-white text-black hover:bg-gray-200 font-semibold py-6 rounded-xl text-lg shadow-lg">
                  Start Creating Now
                </Button>
              </Link>
              <p className="text-center text-xs text-gray-500 mt-3">
                Prices are estimated based on standard usage.
              </p>
            </div>

          </div>
        </div>
      )}

    </div>
  );
};

export default LandingPage;

// --- Data ---

const pricingTiers = [
  {
    name: "Pay As You Go",
    price: "$0.10",
    unit: "per video",
    description: "Perfect for testing ideas or one-off projects.",
    features: ["No monthly subscription", "Access to all models", "Standard generation speed"],
    popular: false,
  },
  {
    name: "Creator Bundle",
    price: "$1.00",
    unit: "per 10 videos",
    description: "Great for weekend projects and content creators.",
    features: ["10 Credits included", "Priority support", "High-res downloads"],
    popular: true,
  },
  {
    name: "Pro Studio",
    price: "$9.00",
    unit: "per 100 videos",
    description: "For power users who generate content daily.",
    features: ["100 Credits included", "Fastest generation speed", "Commercial usage rights"],
    popular: false,
  },
];

const features = [
  {
    label: "Conversation",
    icon: ChatBubbleIcon,
    description: "Advanced chat capabilities to answer questions, generate text, and brainstorm ideas.",
    color: "text-sky-500",
    bgColor: "bg-sky-500/10",
  },
  {
    label: "Image Generation",
    icon: ImageIcon,
    description: "Turn your text prompts into stunning, high-quality visuals in seconds.",
    color: "text-purple-500",
    bgColor: "bg-purple-500/10",
  },
  {
    label: "Video Creation",
    icon: VideoIcon,
    description: "Bring stories to life with AI-generated video clips from simple descriptions.",
    color: "text-pink-700",
    bgColor: "bg-pink-700/10",
  },
  {
    label: "Music Composition",
    icon: DiscIcon,
    description: "Generate original audio tracks and sound effects for your projects.",
    color: "text-orange-500",
    bgColor: "bg-orange-500/10",
  },
  {
    label: "Code Assistant",
    icon: CodeIcon,
    description: "Generate, debug, and explain code snippets in various programming languages.",
    color: "text-green-400",
    bgColor: "bg-green-500/10",
  },
  {
    label: "Fast & Secure",
    icon: RocketIcon,
    description: "Enterprise-grade security with lightning-fast generation speeds.",
    color: "text-white",
    bgColor: "bg-white/10",
  },
];


