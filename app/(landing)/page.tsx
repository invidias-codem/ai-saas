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

const LandingPage = () => {
  const [isPricingOpen, setIsPricingOpen] = useState(false);

  return (
    <div className="bg-[#111827] min-h-screen flex flex-col overflow-x-hidden relative">
      
      {/* Background Gradients */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
      </div>

      {/* Header */}
      <header className="relative z-10 py-6 px-6 md:px-10 flex justify-between items-center max-w-7xl mx-auto w-full">
        <div className="flex items-center gap-2">
          <div className="relative w-8 h-8">
             <Image src="/Genie.png" alt="Genie Logo" fill className="object-cover" /> 
          </div>
          <span className="text-2xl font-bold text-white tracking-tight">Genie AI</span>
        </div>
        <div className="flex items-center gap-x-2">
          {/* Pricing Trigger Button */}
          <Button 
            onClick={() => setIsPricingOpen(true)}
            variant="ghost" 
            className="text-gray-300 hover:text-white hover:bg-white/10 rounded-full hidden sm:inline-flex"
          >
            Pricing
          </Button>

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
        <section className="pt-20 pb-32 px-4 text-center space-y-8 max-w-4xl mx-auto">
          <div className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-3 py-1 text-sm text-white backdrop-blur-xl animate-fade-in">
            <span className="flex h-2 w-2 rounded-full bg-sky-400 mr-2"></span>
            The All-in-One AI Platform
          </div>
          
          <h1 className="text-5xl sm:text-6xl md:text-7xl font-extrabold text-white tracking-tight leading-[1.1]">
            Unleash Your Potential <br />
            with <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">Genie AI</span>
          </h1>
          
          <p className="text-lg sm:text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Generate content, write code, compose music, and create videos in seconds. 
            Streamline your workflow with the smartest AI assistant.
          </p>
          
          <div className="flex flex-col sm:flex-row justify-center items-center gap-4 pt-4">
            <Link href="/sign-up" className="w-full sm:w-auto">
              <Button size="lg" className="w-full sm:w-auto bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white rounded-full text-lg px-8 py-6 shadow-lg shadow-purple-500/25">
                Start Generating For Free
              </Button>
            </Link>
            {/* Mobile Pricing Button */}
            <Button 
              onClick={() => setIsPricingOpen(true)}
              variant="outline" 
              size="lg"
              className="w-full sm:w-auto sm:hidden rounded-full border-white/20 text-white hover:bg-white/10"
            >
              View Pricing
            </Button>
            <div className="text-sm text-gray-500 mt-2 sm:mt-0 hidden sm:block">
              No credit card required
            </div>
          </div>
        </section>

        {/* Features Grid */}
        <section className="px-4 pb-20 max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-white mb-4">Supercharge your creativity</h2>
            <p className="text-gray-400">Five powerful tools in one dashboard.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 px-4">
            {features.map((feature) => (
              <div 
                key={feature.label} 
                className="group p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition duration-200 backdrop-blur-sm cursor-default"
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

        {/* Testimonials */}
        <section className="py-20 border-t border-white/10 bg-black/20">
          <div className="max-w-5xl mx-auto px-6 text-center">
            <h2 className="text-3xl font-bold text-white mb-12">Trusted by Creators</h2>
            <div className="grid md:grid-cols-3 gap-8">
              {testimonials.map((item, i) => (
                <div key={i} className="p-6 rounded-xl bg-[#192339] border border-white/5">
                  {/* ✅ FIXED: Replaced raw quotes with &quot; */}
                  <p className="text-gray-300 mb-4 italic">&quot;{item.quote}&quot;</p>
                  <div className="flex items-center justify-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500" />
                    <div className="text-left">
                      <p className="text-sm font-semibold text-white">{item.name}</p>
                      <p className="text-xs text-gray-500">{item.role}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="py-10 border-t border-white/10 bg-[#111827]">
        <div className="max-w-7xl mx-auto px-6">
          {/* Links */}
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 mb-8">
            <div className="flex items-center gap-2">
              <div className="relative w-6 h-6">
                <Image src="/Genie.png" alt="Genie Logo" fill className="object-cover" /> 
              </div>
              <span className="text-lg font-bold text-white">Genie AI</span>
            </div>
            
            <div className="flex items-center gap-6 text-sm text-gray-400">
              <Link href="/blog" className="hover:text-white transition">Blog</Link>
              <Link href="/slack" className="hover:text-white transition">Slack Integration</Link>
              <Link href="/support" className="hover:text-white transition">Support</Link>
              <Link href="/privacy" className="hover:text-white transition">Privacy Policy</Link>
            </div>
          </div>

          {/* Scout Forge Badge */}
          <div className="mb-8 flex justify-center">
            <a 
              href="https://scoutforge.net/reviews/genie-ai/" 
              title="Trusted and reviewed by Scout Forge" 
              target="_blank" 
              rel="noopener noreferrer"
              className="hover:opacity-80 transition-opacity relative w-[250px] h-[54px] block"
            >
              <Image 
                src="https://scoutforge.net/wp-content/themes/wp-theme/assets/img/badges/badge-light.webp" 
                alt="Trusted and Reviewed by Scout Forge"
                fill
                className="object-contain"
                unoptimized={true} 
              />
            </a>
          </div>

          <div className="pt-8 border-t border-white/10 text-center">
            <p className="text-gray-500 text-sm">
              © {new Date().getFullYear()} Genie AI. All rights reserved.
            </p>
          </div>
        </div>
      </footer>

      {/* Pricing Modal */}
      {isPricingOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={() => setIsPricingOpen(false)}
          />
          
          {/* Modal Content */}
          <div className="relative w-full max-w-lg bg-[#111827] border border-white/10 sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-10 fade-in duration-300">
            
            {/* Modal Header */}
            <div className="p-6 border-b border-white/10 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-white">Flexible Pricing</h2>
                <p className="text-sm text-gray-400">Pay only for what you generate.</p>
              </div>
              <Button 
                variant="ghost" 
                size="icon" 
                onClick={() => setIsPricingOpen(false)}
                className="text-gray-400 hover:text-white rounded-full"
              >
                <Cross2Icon className="w-5 h-5" />
              </Button>
            </div>

            {/* Modal Body (Scrollable) */}
            <div className="p-6 overflow-y-auto space-y-4">
              {pricingTiers.map((tier, index) => (
                <div 
                  key={index}
                  className={cn(
                    "relative p-4 rounded-xl border cursor-pointer transition-all",
                    tier.popular 
                      ? "border-purple-500 bg-purple-500/10 shadow-[0_0_20px_-5px_rgba(168,85,247,0.4)]" 
                      : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20"
                  )}
                >
                  {tier.popular && (
                    <div className="absolute -top-3 right-4 px-2 py-0.5 bg-purple-600 text-white text-[10px] font-bold uppercase tracking-wide rounded-full">
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
              <Link href="/sign-up" className="w-full">
                <Button className="w-full bg-white text-black hover:bg-gray-200 font-semibold py-6 rounded-xl text-lg">
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

const testimonials = [
  {
    quote: "Genie has completely transformed how I create content for my social media channels.",
    name: "Alex R.",
    role: "Content Creator"
  },
  {
    quote: "The code generation tool saves me hours of debugging every single week. Highly recommend.",
    name: "Sarah J.",
    role: "Software Engineer"
  },
  {
    quote: "I use the image generator for all my presentation decks. The quality is unmatched.",
    name: "David K.",
    role: "Product Manager"
  }
];