"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import Link from "next/link";
import Image from "next/image";
import {
  EnvelopeClosedIcon,
  ChatBubbleIcon,
  QuestionMarkCircledIcon,
  CheckCircledIcon,
  ExclamationTriangleIcon,
} from "@radix-ui/react-icons";
import {
  Mail,
  MessageSquare,
  Clock,
  FileText,
  Slack,
  ChevronDown,
  ChevronUp,
  Send,
  Loader2,
  ImageIcon,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const SupportPage = () => {
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<"idle" | "success" | "error">("idle");
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitStatus("idle");

    try {
      const response = await fetch("/api/support", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        throw new Error("Failed to send message");
      }

      setSubmitStatus("success");
      setFormData({ name: "", email: "", subject: "", message: "" });
    } catch (error) {
      console.error(error);
      setSubmitStatus("error");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="bg-[#111827] min-h-screen flex flex-col overflow-x-hidden relative">

      {/* Background Gradients */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-500/20 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-purple-500/20 rounded-full blur-3xl" />
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
          <Link href="/slack">
            <Button variant="ghost" className="text-gray-300 hover:text-white hover:bg-white/10 rounded-full hidden sm:inline-flex">
              <Slack className="w-4 h-4 mr-2" />
              Slack
            </Button>
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

      <main className="relative z-10 flex-grow">
        {/* Hero Section */}
        <section className="pt-16 pb-12 px-4 text-center space-y-6 max-w-4xl mx-auto">
          <div className="inline-flex items-center rounded-full border border-blue-500/50 bg-blue-500/20 px-4 py-2 text-sm text-white backdrop-blur-xl">
            <MessageSquare className="w-4 h-4 mr-2" />
            Support Center
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight leading-[1.1]">
            How Can We Help?
          </h1>

          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            We&apos;re here to help you get the most out of Genie AI.
            Reach out and we&apos;ll respond within 2 business days.
          </p>
        </section>

        {/* Contact Options */}
        <section className="px-4 pb-16 max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {contactOptions.map((option, index) => (
              <div
                key={index}
                className="p-6 rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 transition text-center"
              >
                <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-4", option.bgColor)}>
                  <option.icon className={cn("w-6 h-6", option.color)} />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{option.title}</h3>
                <p className="text-gray-400 text-sm mb-4">{option.description}</p>
                {option.action && (
                  <a href={option.action.href} className="text-blue-400 hover:text-blue-300 text-sm font-medium">
                    {option.action.label} →
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* Feature Walkthroughs */}
        <section className="px-4 pb-16 max-w-5xl mx-auto space-y-12">

          {/* Slack Integration */}
          <div className="bg-white/5 border border-white/10 rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <Slack className="w-8 h-8 text-white" />
              <h2 className="text-2xl font-bold text-white">Getting Started with Slack</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Talking to Genie</h3>
                <p className="text-gray-400 text-sm mb-4">
                  Genie lives in your Slack workspace. You can communicate in two ways:
                </p>
                <ul className="space-y-3 text-sm text-gray-300">
                  <li className="flex items-start gap-2">
                    <span className="bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded text-xs mt-0.5">Channels</span>
                    <span>Mention <code className="bg-white/10 px-1 rounded">@Genie</code> in any invited channel.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="bg-purple-500/20 text-purple-400 px-2 py-0.5 rounded text-xs mt-0.5">DMs</span>
                    <span>Send a Direct Message for private assistance. No mention needed!</span>
                  </li>
                </ul>
              </div>
              <div className="bg-black/30 rounded-lg p-4 font-mono text-sm text-gray-300 border border-white/5">
                <div className="mb-2 text-gray-500">{"// Example Channel Message"}</div>
                <div className="flex gap-2 mb-4">
                  <span className="text-blue-400">@Genie</span>
                  <span>Summarize the last 50 messages in this channel.</span>
                </div>
                <div className="mb-2 text-gray-500">{"// Example DM"}</div>
                <div>Draft a professional email to a client about a delay.</div>
              </div>
            </div>
          </div>

          {/* Image Generation */}
          <div className="bg-gradient-to-br from-pink-500/10 to-purple-500/10 border border-white/10 rounded-2xl p-8">
            <div className="flex items-center gap-3 mb-6">
              <ImageIcon className="w-8 h-8 text-pink-400" />
              <h2 className="text-2xl font-bold text-white">Image Generation</h2>
            </div>

            <div className="space-y-6">
              <div>
                <p className="text-gray-300 mb-4">
                  Create stunning AI images directly within Slack. Just ask Genie to &quot;generate&quot;, &quot;create&quot;, or &quot;draw&quot; something.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="bg-black/30 rounded-lg p-3 text-sm text-gray-300 border border-white/5 flex-1">
                    &quot;Generate a cyberpunk city at night&quot;
                  </div>
                  <div className="bg-black/30 rounded-lg p-3 text-sm text-gray-300 border border-white/5 flex-1">
                    &quot;Create a logo for a coffee shop&quot;
                  </div>
                </div>
              </div>

              <div className="border-t border-white/10 pt-6">
                <h3 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-yellow-400" />
                  Advanced: Controlling Models
                </h3>
                <p className="text-gray-400 text-sm mb-4">
                  You can control which AI engine the Slack bot uses by changing your settings here on the website.
                  Your preference instantly syncs to Slack!
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                    <div className="text-white font-medium mb-1">Flux Schnell</div>
                    <div className="text-xs text-gray-500">Default • Fast</div>
                  </div>
                  <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                    <div className="text-white font-medium mb-1">SDXL</div>
                    <div className="text-xs text-gray-500">Detail • Creative</div>
                  </div>
                  <div className="bg-white/5 p-4 rounded-xl border border-white/5">
                    <div className="text-white font-medium mb-1">Playground v2.5</div>
                    <div className="text-xs text-gray-500">Aesthetic • Vibrant</div>
                  </div>
                </div>

                <div className="mt-4">
                  <Link href="/image">
                    <Button variant="outline" className="border-white/20 text-white hover:bg-white/10">
                      Change Model Preference →
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          </div>

        </section>

        {/* Contact Form */}
        <section className="py-16 px-4 border-t border-white/10 bg-black/20">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-white mb-4">Send Us a Message</h2>
              <p className="text-gray-400">Fill out the form below and we&apos;ll get back to you as soon as possible.</p>
            </div>

            {submitStatus === "success" ? (
              <div className="p-8 rounded-2xl border border-green-500/30 bg-green-500/10 text-center">
                <CheckCircledIcon className="w-12 h-12 text-green-400 mx-auto mb-4" />
                <h3 className="text-xl font-semibold text-white mb-2">Message Sent!</h3>
                <p className="text-gray-400 mb-6">
                  Thank you for reaching out. We&apos;ll respond within 2 business days.
                </p>
                <Button
                  onClick={() => setSubmitStatus("idle")}
                  variant="outline"
                  className="border-white/20 text-white hover:bg-white/10"
                >
                  Send Another Message
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Your Name
                    </label>
                    <Input
                      type="text"
                      required
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-purple-500"
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-300 mb-2">
                      Email Address
                    </label>
                    <Input
                      type="email"
                      required
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-purple-500"
                      placeholder="john@example.com"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Subject
                  </label>
                  <Input
                    type="text"
                    required
                    value={formData.subject}
                    onChange={(e) => setFormData({ ...formData, subject: e.target.value })}
                    className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-purple-500"
                    placeholder="How can we help?"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2">
                    Message
                  </label>
                  <Textarea
                    required
                    rows={6}
                    value={formData.message}
                    onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                    className="bg-white/5 border-white/10 text-white placeholder:text-gray-500 focus:border-purple-500 resize-none"
                    placeholder="Please describe your issue or question in detail..."
                  />
                </div>

                {submitStatus === "error" && (
                  <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center gap-3">
                    <ExclamationTriangleIcon className="w-5 h-5 text-red-400" />
                    <p className="text-red-400 text-sm">Something went wrong. Please try again.</p>
                  </div>
                )}

                <Button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white py-6 rounded-xl text-lg"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5 mr-2" />
                      Send Message
                    </>
                  )}
                </Button>
              </form>
            )}
          </div>
        </section>

        {/* FAQ Section */}
        <section className="py-16 px-4">
          <div className="max-w-3xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-3xl font-bold text-white mb-4">Frequently Asked Questions</h2>
              <p className="text-gray-400">Quick answers to common questions</p>
            </div>

            <div className="space-y-4">
              {faqs.map((faq, index) => (
                <div
                  key={index}
                  className="rounded-xl border border-white/10 bg-white/5 overflow-hidden"
                >
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === index ? null : index)}
                    className="w-full p-5 flex items-center justify-between text-left hover:bg-white/5 transition"
                  >
                    <span className="font-medium text-white pr-4">{faq.question}</span>
                    {expandedFaq === index ? (
                      <ChevronUp className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-gray-400 flex-shrink-0" />
                    )}
                  </button>
                  {expandedFaq === index && (
                    <div className="px-5 pb-5 text-gray-400 text-sm leading-relaxed">
                      {faq.answer}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Response Time */}
        <section className="py-16 px-4 border-t border-white/10">
          <div className="max-w-4xl mx-auto text-center">
            <Clock className="w-10 h-10 text-blue-400 mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-white mb-4">Our Response Commitment</h2>
            <p className="text-gray-400 max-w-2xl mx-auto">
              We aim to respond to all support requests within <strong className="text-white">2 business days</strong>.
              For urgent issues, please include &quot;URGENT&quot; in your subject line.
            </p>
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
              <Link href="/slack" className="hover:text-white transition">Slack Integration</Link>
              <Link href="/" className="hover:text-white transition">Home</Link>
              <Link href="/blog" className="hover:text-white transition">Blog</Link>
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

export default SupportPage;

// --- Data ---

const contactOptions = [
  {
    title: "Email Support",
    description: "Send us an email and we'll respond within 2 business days.",
    icon: Mail,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    action: {
      label: "jjmohamme14@gmail.com",
      href: "mailto:jjmohamme14@gmail.com",
    },
  },
  {
    title: "Documentation",
    description: "Browse our guides and documentation for quick answers.",
    icon: FileText,
    color: "text-purple-400",
    bgColor: "bg-purple-500/10",
    action: {
      label: "View Docs",
      href: "/docs",
    },
  },
  {
    title: "Slack Community",
    description: "Join our community for tips, updates, and peer support.",
    icon: Slack,
    color: "text-green-400",
    bgColor: "bg-green-500/10",
    action: {
      label: "Join Slack",
      href: "/slack",
    },
  },
  {
    title: "Live Chat",
    description: "Chat with our support bot on Telegram for instant help.",
    icon: Send,
    color: "text-blue-400",
    bgColor: "bg-blue-500/10",
    action: {
      label: "Start Chat",
      href: "https://t.me/Genie_Support_Bot", // Update with your actual Bot Username
    },
  },
];

const faqs = [
  {
    question: "How do I add Genie AI to my Slack workspace?",
    answer: "Visit our Slack integration page and click 'Add to Slack'. You'll be prompted to authorize Genie AI in your workspace. Once authorized, you can start using /genie commands or @mention Genie in any channel.",
  },
  {
    question: "Is my data secure?",
    answer: "Yes, we take security seriously. We use industry-standard encryption, never store your Slack messages, and don't use your data to train AI models. See our Privacy Policy for more details.",
  },
  {
    question: "What AI model does Genie use?",
    answer: "Genie AI is powered by Google's Gemini 2.0 Flash model, which provides fast, accurate, and contextually aware responses for a wide range of tasks.",
  },
  {
    question: "Can I use Genie AI for free?",
    answer: "Yes! Genie AI offers a free tier with generous usage limits. You can upgrade to a paid plan for higher limits and additional features.",
  },
  {
    question: "How do I disconnect Genie from my Slack workspace?",
    answer: "Go to your Settings page in the Genie AI web app and click 'Disconnect' in the Slack Integration section. You can also remove the app from your Slack workspace settings.",
  },
  {
    question: "What commands are available in Slack?",
    answer: "You can use /genie help to see all commands. Common commands include /genie ask [question], /genie code [request], /genie explain [topic], and /genie summarize [text].",
  },
];
