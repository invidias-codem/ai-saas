import { Button } from "@/components/ui/button";
import Link from "next/link";
import { CheckIcon, CodeIcon, LightningBoltIcon } from "@radix-ui/react-icons";
import { MessageSquare, Bot, Zap, Shield, Users, ImageIcon, Presentation, Calendar, ArrowRight, Sparkles } from "lucide-react";
import { BrandIcon } from "@/lib/icons/brandIcons";
import { cn } from "@/lib/utils";

export default function SlackLandingPage() {
  const addToSlackUrl = '/api/integrations/slack/auth';

  return (
    <main className="min-w-0">
      {/* Hero Section */}
      <section className="pt-10 pb-14 sm:pt-16 sm:pb-20 px-4 text-center space-y-10 max-w-5xl mx-auto">
        <div className="inline-flex items-center rounded-full border border-border bg-accent px-5 py-2.5 text-sm text-accent-foreground">
          <Sparkles className="w-4 h-4 mr-2 text-primary" />
          Now with Image, Slides & Calendar
        </div>

        <h1 className="text-4xl sm:text-6xl md:text-7xl font-bold text-foreground tracking-tight leading-[1.05]">
          From Slack Discussion to<br />
          <span className="text-primary">
            Finished Deliverable
          </span>
          <br />in Minutes
        </h1>

        <p className="text-xl sm:text-2xl text-muted-foreground max-w-3xl mx-auto leading-relaxed font-light">
          AI-powered image generation, slide decks, and calendar scheduling—directly from your Slack conversations.
        </p>

        <div className="flex flex-col sm:flex-row justify-center items-center gap-4 pt-6">
          <Button asChild size="lg" variant="action" className="min-h-12 gap-2 rounded-xl px-5 py-3 whitespace-normal text-center sm:px-6">
            <Link href={addToSlackUrl}>
              <BrandIcon name="Slack" className="w-6 h-6" size={24} />
              Connect to Slack
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="min-h-12 gap-2 rounded-xl px-5 py-3 whitespace-normal text-center sm:px-6">
            <Link href="#features">
              See How It Works
              <ArrowRight className="w-5 h-5 ml-2" />
            </Link>
          </Button>
        </div>

        <p className="text-sm text-muted-foreground">
          Free to use • No credit card required • Works with any Slack workspace
        </p>
      </section>

      {/* Competitive comparison */}
      <section className="py-20 px-4 border-y border-border bg-chrome relative overflow-hidden">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-bold text-foreground mb-4">Why Teams Choose Lattice OS</h2>
            <p className="text-muted-foreground text-lg">More features, better performance, unbeatable value</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="relative group">
              <div className="relative p-5 sm:p-8 rounded-2xl border border-border bg-card">
                <div className="text-3xl font-bold text-foreground xl:text-4xl mb-2">Free to start</div>
                <div className="text-muted-foreground mb-4">Welcome credits, then pay-as-you-go</div>
                <div className="text-sm text-muted-foreground">Start free — buy credits only when you need more</div>
              </div>
            </div>

            <div className="relative group">
              <div className="relative p-5 sm:p-8 rounded-2xl border border-border bg-card">
                <div className="text-3xl font-bold text-foreground xl:text-4xl mb-2">4+</div>
                <div className="text-muted-foreground mb-4">Core Features</div>
                <div className="text-sm text-muted-foreground">Images, Slides, Calendar + Code Assistant</div>
              </div>
            </div>

            <div className="relative group">
              <div className="relative p-5 sm:p-8 rounded-2xl border border-border bg-card">
                <div className="text-3xl font-bold text-foreground xl:text-4xl mb-2">Pay-as-you-go</div>
                <div className="text-muted-foreground mb-4">No subscriptions</div>
                <div className="text-sm text-muted-foreground">Credits, not monthly caps — use what you need</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Use cases */}
      <section id="features" className="scroll-mt-16 py-16 md:py-20 px-4 lg:max-w-7xl lg:mx-auto relative overflow-hidden">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-foreground mb-4">Ways to Use Lattice OS in Slack</h2>
          <p className="text-muted-foreground text-lg">Transform hours of work into minutes</p>
        </div>

        <div className="space-y-24">
          {useCases.map((useCase, index) => (
            <div
              key={index}
              className={cn(
                "grid grid-cols-1 lg:grid-cols-2 gap-8 items-center",
                index % 2 === 1 && "lg:grid-flow-dense"
              )}
            >
              <div className={cn("space-y-6", index % 2 === 1 && "lg:col-start-2")}>
                <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-accent border border-border">
                  <useCase.icon className="w-5 h-5 text-primary" />
                  <span className="text-sm text-accent-foreground font-medium">{useCase.category}</span>
                </div>

                <h3 className="text-3xl font-bold text-foreground">{useCase.title}</h3>

                <div className="flex flex-wrap items-baseline gap-3">
                  <div className="text-muted-foreground">
                    <div className="text-sm uppercase tracking-wide mb-1">Before</div>
                    <div className="text-2xl font-bold line-through">{useCase.before}</div>
                  </div>
                  <ArrowRight className="h-6 w-6 shrink-0 text-primary" />
                  <div className="text-foreground">
                    <div className="text-sm uppercase tracking-wide mb-1 text-primary">After</div>
                    <div className="text-3xl font-bold text-primary">
                      {useCase.after}
                    </div>
                  </div>
                </div>

                <p className="text-muted-foreground text-lg leading-relaxed">{useCase.description}</p>

                <div className="pt-4">
                  <code className="inline-block max-w-full break-words rounded-lg border border-border bg-chrome px-4 py-2 text-sm text-primary">
                    {useCase.example}
                  </code>
                </div>
              </div>

              <div className={cn(
                "relative group",
                index % 2 === 1 && "lg:col-start-1 lg:row-start-1"
              )}>
                <div className="relative aspect-[9/20] lg:aspect-[9/16] rounded-2xl border border-border bg-[var(--lattice-mineral-ink)] overflow-hidden">
                  {useCase.title === 'Image Generation' ? (
                    <video
                      className="w-full h-full object-cover"
                      src="/videos/slack-image-gen.mp4"
                      muted
                      playsInline
                      controls
                      preload="none"
                    />
                  ) : useCase.title === 'Slide Decks' ? (
                    <video
                      className="w-full h-full object-cover"
                      src="/videos/slack-slides.mp4"
                      muted
                      playsInline
                      controls
                      preload="none"
                    />
                  ) : useCase.title === 'Calendar Events' ? (
                    <video
                      className="w-full h-full object-cover"
                      src="/videos/slack-calendar.mp4"
                      muted
                      playsInline
                      controls
                      preload="none"
                    />
                  ) : (
                    <>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <useCase.icon className="w-24 h-24 text-white/10" />
                      </div>
                      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black to-transparent">
                        <div className="text-[var(--lattice-limestone)] font-semibold">{useCase.title}</div>
                        <div className="text-[var(--lattice-mist-sage)] text-sm">{useCase.category}</div>
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
      <section className="px-4 py-20 max-w-5xl mx-auto border-t border-border relative overflow-hidden">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-foreground mb-4">Get Started in 60 Seconds</h2>
          <p className="text-muted-foreground text-lg">Three simple steps to transform your Slack workspace</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {steps.map((step, index) => (
            <div key={index} className="text-center group">
              <div className="relative mb-6">
                <div className="relative w-16 h-16 rounded-full bg-accent flex items-center justify-center text-accent-foreground font-bold text-2xl mx-auto">
                  {index + 1}
                </div>
              </div>
              <h3 className="text-xl font-semibold text-foreground mb-3">{step.title}</h3>
              <p className="text-muted-foreground">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* All Features Grid */}
      <section className="px-4 py-20 max-w-7xl mx-auto border-t border-border relative overflow-hidden">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold text-foreground mb-4">Everything You Need</h2>
          <p className="text-muted-foreground text-lg">Powerful AI capabilities, all in one integration</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {allFeatures.map((feature) => (
            <div
              key={feature.label}
              className="group p-6 rounded-2xl border border-border bg-card hover:bg-accent transition-colors duration-200 hover:border-primary"
            >
              <div className="w-12 h-12 rounded-xl flex items-center justify-center mb-4 transition-transform duration-200 group-hover:scale-110 bg-accent">
                <feature.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold text-foreground mb-2">{feature.label}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Security Section */}
      <section className="py-20 px-4 border-t border-border relative overflow-hidden">
        <div className="max-w-4xl mx-auto text-center">
          <Shield className="w-12 h-12 text-primary mx-auto mb-6" />
          <h2 className="text-4xl font-bold text-foreground mb-4">Enterprise-Grade Security</h2>
          <p className="text-muted-foreground mb-12 max-w-2xl mx-auto text-lg">
            Your data is protected with industry-leading security practices.
            We never store your Slack messages or use them to train AI models.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {securityFeatures.map((feature, index) => (
              <div key={index} className="p-6 rounded-xl bg-card border border-border hover:border-primary transition-colors duration-200">
                <CheckIcon className="w-6 h-6 text-primary mx-auto mb-3" />
                <p className="text-foreground font-medium">{feature}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="py-16 md:py-20 px-4 border-t border-border bg-chrome">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold text-foreground sm:text-5xl mb-6">
            Ready to Transform Your Workflow?
          </h2>
          <p className="text-muted-foreground mb-10 text-xl max-w-2xl mx-auto">
            Join thousands of teams using Lattice OS to work smarter, not harder.
          </p>
          <Button asChild size="lg" variant="action" className="min-h-12 gap-2 rounded-xl px-5 py-3 whitespace-normal text-center sm:px-6">
            <Link href={addToSlackUrl}>
              <BrandIcon name="Slack" className="w-6 h-6 mr-3" size={24} />
              Add to Slack — It&apos;s Free
            </Link>
          </Button>
          <p className="text-muted-foreground mt-6 text-sm">
            No credit card required • 2-minute setup • Cancel anytime
          </p>
        </div>
      </section>
    </main>
  );
}

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
  },
  {
    label: "Slide Decks",
    icon: Presentation,
    description: "Professional PowerPoint presentations generated from your topic. Complete with layouts and content.",
  },
  {
    label: "Calendar Scheduling",
    icon: Calendar,
    description: "Schedule meetings with @mentions. Automatic email resolution and Google Calendar integration.",
  },
  {
    label: "Code Assistant",
    icon: CodeIcon,
    description: "Generate, debug, and explain code in any programming language with context-aware responses.",
  },
  {
    label: "@Mentions",
    icon: Bot,
    description: "Mention @Genie in any channel for contextual AI assistance that understands your conversation.",
  },
  {
    label: "Direct Messages",
    icon: MessageSquare,
    description: "Private conversations with Lattice OS for sensitive questions and personal assistance.",
  },
  {
    label: "Instant Responses",
    icon: LightningBoltIcon,
    description: "Get AI responses in seconds with streaming output. No waiting, no delays.",
  },
  {
    label: "Team Collaboration",
    icon: Users,
    description: "Share AI-generated content with your team in public channels for seamless collaboration.",
  },
  {
    label: "Smart Context",
    icon: Zap,
    description: "Lattice OS understands thread context, attached files, and links for more accurate responses.",
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
