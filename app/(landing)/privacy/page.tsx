"use client";

import { Button } from "@/components/ui/button";
import Link from "next/link";
import Image from "next/image";
import { Shield, Lock, Eye, Trash2, Mail, FileText } from "lucide-react";

const PrivacyPolicyPage = () => {
  const lastUpdated = "January 15, 2025";

  return (
    <div className="bg-[#111827] min-h-screen flex flex-col overflow-x-hidden relative">

      {/* Background Gradients */}
      <div className="fixed inset-0 z-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-green-500/10 rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-500/10 rounded-full blur-3xl" />
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
          <div className="inline-flex items-center rounded-full border border-green-500/50 bg-green-500/20 px-4 py-2 text-sm text-white backdrop-blur-xl">
            <Shield className="w-4 h-4 mr-2" />
            Privacy Policy
          </div>

          <h1 className="text-4xl sm:text-5xl font-extrabold text-white tracking-tight leading-[1.1]">
            Your Privacy Matters
          </h1>

          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            We are committed to protecting your privacy and being transparent about how we handle your data.
          </p>

          <p className="text-sm text-gray-500">
            Last updated: {lastUpdated}
          </p>
        </section>

        {/* Quick Summary */}
        <section className="px-4 pb-16 max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {privacyHighlights.map((item, index) => (
              <div
                key={index}
                className="p-6 rounded-2xl border border-white/10 bg-white/5 text-center"
              >
                <div className="w-12 h-12 rounded-xl bg-green-500/10 flex items-center justify-center mx-auto mb-4">
                  <item.icon className="w-6 h-6 text-green-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-gray-400 text-sm">{item.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Policy Content */}
        <section className="py-16 px-4 border-t border-white/10 bg-black/20">
          <div className="max-w-3xl mx-auto prose prose-invert">

            {/* Section 1 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 text-sm font-bold">1</span>
                Information We Collect
              </h2>
              <div className="text-gray-300 space-y-4">
                <p>
                  We collect information you provide directly to us, including:
                </p>
                <ul className="list-disc list-inside space-y-2 text-gray-400">
                  <li><strong className="text-white">Account Information:</strong> Name, email address, and authentication data when you create an account.</li>
                  <li><strong className="text-white">Usage Data:</strong> Information about how you interact with our services, including prompts and generated content.</li>
                  <li><strong className="text-white">Slack Integration Data:</strong> When you connect Slack, we receive your Slack user ID, workspace ID, and the content of messages directed to our bot.</li>
                  <li><strong className="text-white">Device Information:</strong> Browser type, IP address, and device identifiers for security and analytics purposes.</li>
                </ul>
              </div>
            </div>

            {/* Section 2 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 text-sm font-bold">2</span>
                How We Use Your Information
              </h2>
              <div className="text-gray-300 space-y-4">
                <p>We use the information we collect to:</p>
                <ul className="list-disc list-inside space-y-2 text-gray-400">
                  <li>Provide, maintain, and improve our AI services</li>
                  <li>Process and respond to your requests and prompts</li>
                  <li>Send you technical notices and support messages</li>
                  <li>Detect, prevent, and address technical issues and security threats</li>
                  <li>Analyze usage patterns to improve user experience</li>
                </ul>
                <div className="p-4 rounded-lg bg-green-500/10 border border-green-500/30 mt-6">
                  <p className="text-green-300 font-medium">
                    🔒 We do NOT use your data to train AI models. Your conversations remain private.
                  </p>
                </div>
              </div>
            </div>

            {/* Section 3 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 text-sm font-bold">3</span>
                Data Retention
              </h2>
              <div className="text-gray-300 space-y-4">
                <p>
                  We retain your data only as long as necessary to provide our services:
                </p>
                <ul className="list-disc list-inside space-y-2 text-gray-400">
                  <li><strong className="text-white">Account Data:</strong> Retained while your account is active and for 30 days after deletion.</li>
                  <li><strong className="text-white">Conversation History:</strong> Stored for up to 90 days to provide context-aware responses, then automatically deleted.</li>
                  <li><strong className="text-white">Slack Messages:</strong> Processed in real-time and not stored permanently. Only metadata may be retained for analytics.</li>
                  <li><strong className="text-white">Generated Content:</strong> Retained for 30 days unless you choose to save it permanently.</li>
                </ul>
              </div>
            </div>

            {/* Section 4 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 text-sm font-bold">4</span>
                Data Sharing
              </h2>
              <div className="text-gray-300 space-y-4">
                <p>
                  We do not sell your personal information. We may share data with:
                </p>
                <ul className="list-disc list-inside space-y-2 text-gray-400">
                  <li><strong className="text-white">Service Providers:</strong> Third-party services that help us operate (e.g., cloud hosting, authentication).</li>
                  <li><strong className="text-white">AI Providers:</strong> Your prompts are sent to Google&apos;s Gemini API for processing. Google&apos;s privacy policy applies to this processing.</li>
                  <li><strong className="text-white">Legal Requirements:</strong> When required by law or to protect our rights and safety.</li>
                </ul>
              </div>
            </div>

            {/* Section 5 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 text-sm font-bold">5</span>
                Your Rights
              </h2>
              <div className="text-gray-300 space-y-4">
                <p>
                  You have the following rights regarding your data:
                </p>
                <ul className="list-disc list-inside space-y-2 text-gray-400">
                  <li><strong className="text-white">Access:</strong> Request a copy of your personal data.</li>
                  <li><strong className="text-white">Correction:</strong> Request correction of inaccurate data.</li>
                  <li><strong className="text-white">Deletion:</strong> Request deletion of your data and account.</li>
                  <li><strong className="text-white">Portability:</strong> Request your data in a portable format.</li>
                  <li><strong className="text-white">Opt-out:</strong> Opt out of marketing communications at any time.</li>
                </ul>
                <p className="mt-4">
                  To exercise these rights, contact us at{" "}
                  <a href="mailto:privacy@genieai.app" className="text-purple-400 hover:text-purple-300">
                    privacy@genieai.app
                  </a>
                </p>
              </div>
            </div>

            {/* Section 6 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 text-sm font-bold">6</span>
                Security
              </h2>
              <div className="text-gray-300 space-y-4">
                <p>
                  We implement industry-standard security measures to protect your data:
                </p>
                <ul className="list-disc list-inside space-y-2 text-gray-400">
                  <li>End-to-end encryption for data in transit (TLS 1.3)</li>
                  <li>Encryption at rest for stored data</li>
                  <li>Regular security audits and penetration testing</li>
                  <li>OAuth 2.0 for secure authentication</li>
                  <li>Access controls and monitoring</li>
                </ul>
              </div>
            </div>

            {/* Section 7 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 text-sm font-bold">7</span>
                Slack Integration
              </h2>
              <div className="text-gray-300 space-y-4">
                <p>
                  When you use our Slack integration:
                </p>
                <ul className="list-disc list-inside space-y-2 text-gray-400">
                  <li>We only access messages that are directly sent to our bot or mention @Genie.</li>
                  <li>We do not access or store your private channels, DMs with other users, or workspace-wide message history.</li>
                  <li>Messages are processed in real-time and not stored permanently.</li>
                  <li>You can disconnect the integration at any time from your Settings page.</li>
                </ul>
              </div>
            </div>

            {/* Section 8 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 text-sm font-bold">8</span>
                Cookies and Tracking
              </h2>
              <div className="text-gray-300 space-y-4">
                <p>
                  We use cookies and similar technologies for:
                </p>
                <ul className="list-disc list-inside space-y-2 text-gray-400">
                  <li><strong className="text-white">Essential Cookies:</strong> Required for authentication and security.</li>
                  <li><strong className="text-white">Analytics Cookies:</strong> Help us understand how you use our service (can be disabled).</li>
                  <li><strong className="text-white">Preference Cookies:</strong> Remember your settings and preferences.</li>
                </ul>
              </div>
            </div>

            {/* Section 9 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 text-sm font-bold">9</span>
                Changes to This Policy
              </h2>
              <div className="text-gray-300 space-y-4">
                <p>
                  We may update this Privacy Policy from time to time. We will notify you of any material changes by:
                </p>
                <ul className="list-disc list-inside space-y-2 text-gray-400">
                  <li>Posting the new policy on this page</li>
                  <li>Updating the &quot;Last updated&quot; date</li>
                  <li>Sending an email notification for significant changes</li>
                </ul>
              </div>
            </div>

            {/* Section 10 */}
            <div className="mb-12">
              <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
                <span className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center text-purple-400 text-sm font-bold">10</span>
                Contact Us
              </h2>
              <div className="text-gray-300 space-y-4">
                <p>
                  If you have any questions about this Privacy Policy or our data practices, please contact us:
                </p>
                <div className="p-6 rounded-xl bg-white/5 border border-white/10 space-y-3">
                  <p className="flex items-center gap-3">
                    <Mail className="w-5 h-5 text-purple-400" />
                    <a href="mailto:privacy@genieai.app" className="text-purple-400 hover:text-purple-300">
                      privacy@genieai.app
                    </a>
                  </p>
                  <p className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-purple-400" />
                    <Link href="/support" className="text-purple-400 hover:text-purple-300">
                      Support Center
                    </Link>
                  </p>
                  <p className="flex items-center gap-3">
                    <div className="w-5 h-5 flex items-center justify-center">
                      {/* Using simple SVG for plane/send since Send import might be missing/aliased */}
                      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-purple-400"><line x1="22" y1="2" x2="11" y2="13"></line><polygon points="22 2 15 22 11 13 2 9 22 2"></polygon></svg>
                    </div>
                    <a href="https://t.me/Gen1eBot" target="_blank" rel="noopener noreferrer" className="text-purple-400 hover:text-purple-300">
                      Chat on Telegram
                    </a>
                  </p>
                </div>
              </div>
            </div>

          </div>
        </section>

        {/* GDPR/CCPA Notice */}
        <section className="py-16 px-4">
          <div className="max-w-3xl mx-auto">
            <div className="p-6 rounded-2xl border border-blue-500/30 bg-blue-500/10">
              <h3 className="text-xl font-bold text-white mb-4">For EU/EEA and California Residents</h3>
              <p className="text-gray-300 mb-4">
                If you are located in the European Union, European Economic Area, or California,
                you have additional rights under GDPR and CCPA respectively. These include:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-400">
                <li>Right to know what personal information is collected</li>
                <li>Right to delete personal information</li>
                <li>Right to opt-out of the sale of personal information (we do not sell your data)</li>
                <li>Right to non-discrimination for exercising your rights</li>
              </ul>
              <p className="text-gray-300 mt-4">
                To exercise these rights, email us at{" "}
                <a href="mailto:privacy@genieai.app" className="text-blue-400 hover:text-blue-300">
                  privacy@genieai.app
                </a>
              </p>
            </div>
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
              <Link href="/support" className="hover:text-white transition">Support</Link>
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

export default PrivacyPolicyPage;

// --- Data ---

const privacyHighlights = [
  {
    title: "No Data Selling",
    description: "We never sell your personal information to third parties.",
    icon: Lock,
  },
  {
    title: "No AI Training",
    description: "Your conversations are not used to train AI models.",
    icon: Eye,
  },
  {
    title: "Easy Deletion",
    description: "Request deletion of your data at any time.",
    icon: Trash2,
  },
];
