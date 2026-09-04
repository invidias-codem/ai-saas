import Link from "next/link";
import Image from "next/image";
import { Shield, Lock, Eye, Trash2, Mail, FileText, Send } from "lucide-react";
import { TELEGRAM_BOT_URL } from "@/lib/constants/contact";

const lastUpdated = "July 11, 2026";

const sectionBadge =
  "w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/70 text-sm font-bold";

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

function Section({ index, title, children }: { index: number; title: string; children: React.ReactNode }) {
  return (
    <div className="mb-12">
      <h2 className="text-2xl font-bold text-white mb-4 flex items-center gap-3">
        <span className={sectionBadge}>{index}</span>
        {title}
      </h2>
      <div className="text-gray-300 space-y-4">{children}</div>
    </div>
  );
}

export default function PrivacyPolicyPage() {
  return (
    <div className="bg-background min-h-screen flex flex-col overflow-x-hidden relative">
      {/* Neutral ambient glow */}
      <div className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-white/[0.04] rounded-full blur-3xl" />
        <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-white/[0.03] rounded-full blur-3xl" />
      </div>

      <main className="relative z-10 flex-grow">
        {/* Hero */}
        <section className="pt-16 pb-12 px-4 text-center space-y-6 max-w-4xl mx-auto">
          <div className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-white backdrop-blur-xl">
            <Shield className="w-4 h-4 mr-2" />
            Privacy Policy
          </div>

          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight leading-[1.15]">
            Your Privacy Matters
          </h1>

          <p className="text-lg text-gray-400 max-w-2xl mx-auto">
            We are committed to protecting your privacy and being transparent about how we handle your data.
          </p>

          <p className="text-sm text-gray-500">Last updated: {lastUpdated}</p>
        </section>

        {/* Quick Summary */}
        <section className="px-4 pb-16 max-w-5xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {privacyHighlights.map((item) => (
              <div
                key={item.title}
                className="p-6 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] text-center"
              >
                <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-4">
                  <item.icon className="w-6 h-6 text-white/80" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">{item.title}</h3>
                <p className="text-gray-400 text-sm">{item.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Policy Content */}
        <section className="py-16 px-4 border-t border-white/5 bg-black/20">
          <div className="max-w-3xl mx-auto prose prose-invert">
            <Section index={1} title="Information We Collect">
              <p>We collect information you provide directly to us, including:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-400">
                <li><strong className="text-white">Account Information:</strong> Name, email address, and authentication data when you create an account.</li>
                <li><strong className="text-white">Usage Data:</strong> Information about how you interact with our services, including prompts and generated content.</li>
                <li><strong className="text-white">Slack Integration Data:</strong> When you connect Slack, we receive your Slack user ID, workspace ID, and the content of messages directed to our bot.</li>
                <li><strong className="text-white">Device Information:</strong> Browser type, IP address, and device identifiers for security and analytics purposes.</li>
              </ul>
            </Section>

            <Section index={2} title="How We Use Your Information">
              <p>We use the information we collect to:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-400">
                <li>Provide, maintain, and improve our AI services</li>
                <li>Process and respond to your requests and prompts</li>
                <li>Send you technical notices and support messages</li>
                <li>Detect, prevent, and address technical issues and security threats</li>
                <li>Analyze usage patterns to improve user experience</li>
              </ul>
              <div className="p-4 rounded-lg bg-white/5 border border-white/10 mt-6">
                <p className="text-white font-medium">
                  We do NOT use your data to train AI models. Your conversations remain private.
                </p>
              </div>
            </Section>

            <Section index={3} title="Data Retention">
              <p>We retain your data only as long as necessary to provide our services:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-400">
                <li><strong className="text-white">Account Data:</strong> Retained while your account is active and for 30 days after deletion.</li>
                <li><strong className="text-white">Conversation History:</strong> Stored for up to 90 days to provide context-aware responses, then automatically deleted.</li>
                <li><strong className="text-white">Slack Messages:</strong> Processed in real-time and not stored permanently. Only metadata may be retained for analytics.</li>
                <li><strong className="text-white">Generated Content:</strong> Retained for 30 days unless you choose to save it permanently.</li>
              </ul>
            </Section>

            <Section index={4} title="Data Sharing">
              <p>We do not sell your personal information. We may share data with:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-400">
                <li><strong className="text-white">Service Providers:</strong> Third-party services that help us operate (e.g., cloud hosting, authentication).</li>
                <li><strong className="text-white">AI Providers:</strong> Your prompts are sent to our supported AI providers for processing. Their privacy policies apply to that processing.</li>
                <li><strong className="text-white">Legal Requirements:</strong> When required by law or to protect our rights and safety.</li>
              </ul>
            </Section>

            <Section index={5} title="Your Rights">
              <p>You have the following rights regarding your data:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-400">
                <li><strong className="text-white">Access:</strong> Request a copy of your personal data.</li>
                <li><strong className="text-white">Correction:</strong> Request correction of inaccurate data.</li>
                <li><strong className="text-white">Deletion:</strong> Request deletion of your data and account.</li>
                <li><strong className="text-white">Portability:</strong> Request your data in a portable format.</li>
                <li><strong className="text-white">Opt-out:</strong> Opt out of marketing communications at any time.</li>
              </ul>
              <p className="mt-4">
                To exercise these rights, contact us via our{" "}
                <Link href="/support" className="text-purple-400 hover:text-purple-300 min-h-[48px] inline-flex items-center transition">
                  Support Center
                </Link>
              </p>
            </Section>

            <Section index={6} title="Security">
              <p>We implement industry-standard security measures to protect your data:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-400">
                <li>End-to-end encryption for data in transit (TLS 1.3)</li>
                <li>Encryption at rest for stored data</li>
                <li>Regular security audits and penetration testing</li>
                <li>OAuth 2.0 for secure authentication</li>
                <li>Access controls and monitoring</li>
              </ul>
            </Section>

            <Section index={7} title="Slack Integration">
              <p>When you use our Slack integration:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-400">
                <li>We only access messages that are directly sent to our bot or that mention our bot.</li>
                <li>We do not access or store your private channels, DMs with other users, or workspace-wide message history.</li>
                <li>Messages are processed in real-time and not stored permanently.</li>
                <li>You can disconnect the integration at any time from your Settings page.</li>
              </ul>
            </Section>

            <Section index={8} title="Cookies and Tracking">
              <p>We use cookies and similar technologies for:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-400">
                <li><strong className="text-white">Essential Cookies:</strong> Required for authentication and security.</li>
                <li><strong className="text-white">Analytics Cookies:</strong> Help us understand how you use our service (can be disabled).</li>
                <li><strong className="text-white">Preference Cookies:</strong> Remember your settings and preferences.</li>
              </ul>
            </Section>

            <Section index={9} title="Changes to This Policy">
              <p>We may update this Privacy Policy from time to time. We will notify you of any material changes by:</p>
              <ul className="list-disc list-inside space-y-2 text-gray-400">
                <li>Posting the new policy on this page</li>
                <li>Updating the &quot;Last updated&quot; date</li>
                <li>Sending an email notification for significant changes</li>
              </ul>
            </Section>

            <Section index={10} title="Contact Us">
              <p>If you have any questions about this Privacy Policy or our data practices, please contact us:</p>
              <div className="p-6 rounded-xl bg-white/[0.02] border border-white/10 space-y-3">
                <p className="flex items-center gap-3">
                  <Mail className="w-5 h-5 text-white/70" />
                  <Link href="/support" className="text-purple-400 hover:text-purple-300 min-h-[48px] inline-flex items-center transition">
                    Support Center
                  </Link>
                </p>
                <p className="flex items-center gap-3">
                  <FileText className="w-5 h-5 text-white/70" />
                  <Link href="/support" className="text-purple-400 hover:text-purple-300 min-h-[48px] inline-flex items-center transition">
                    Documentation &amp; Policies
                  </Link>
                </p>
                <p className="flex items-center gap-3">
                  <Send className="w-5 h-5 text-white/70" />
                  <a
                    href={TELEGRAM_BOT_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 min-h-[48px] inline-flex items-center transition"
                  >
                    Chat on Telegram
                  </a>
                </p>
              </div>
            </Section>
          </div>
        </section>

        {/* GDPR/CCPA Notice */}
        <section className="py-16 px-4">
          <div className="max-w-3xl mx-auto">
            <div className="p-6 rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <h3 className="text-xl font-bold text-white mb-4">For EU/EEA and California Residents</h3>
              <p className="text-gray-300 mb-4">
                If you are located in the European Union, European Economic Area, or California, you have
                additional rights under GDPR and CCPA respectively. These include:
              </p>
              <ul className="list-disc list-inside space-y-2 text-gray-400">
                <li>Right to know what personal information is collected</li>
                <li>Right to delete personal information</li>
                <li>Right to opt-out of the sale of personal information (we do not sell your data)</li>
                <li>Right to non-discrimination for exercising your rights</li>
              </ul>
              <p className="text-gray-300 mt-4">
                To exercise these rights, contact us via our{" "}
                <Link href="/support" className="text-purple-400 hover:text-purple-300 min-h-[48px] inline-flex items-center transition">
                  Support Center
                </Link>
              </p>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
