import { PricingCards } from "@/components/modals/PricingModal";

export default function PricingPage() {
  return (
    <div className="relative min-h-screen bg-background text-foreground overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(168,85,247,0.08),transparent_60%)] pointer-events-none" />

      <div className="relative z-10">
        <header className="border-b border-border/60 backdrop-blur-md">
          <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
            <a href="/" className="flex items-center gap-3">
              <div className="w-8 h-8 rounded bg-gradient-to-br from-purple-500 to-pink-600" />
              <span className="text-lg font-bold tracking-tight font-heading">Lattice OS</span>
            </a>
            <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-muted-foreground">
              <a href="/" className="hover:text-foreground transition-colors">Home</a>
              <a href="/support" className="hover:text-foreground transition-colors">Support</a>
            </nav>
            <a href="/onboarding">
              <button className="rounded-full px-6 py-2 text-sm font-semibold bg-primary text-primary-foreground">
                Start 7-Day Trial
              </button>
            </a>
          </div>
        </header>

        <section className="mx-auto max-w-7xl px-6 pt-24 pb-20 md:pt-32 md:pb-28">
          <div className="max-w-3xl mx-auto text-center mb-16 animate-fade-in">
            <span className="inline-block rounded-full border border-purple-500/30 bg-purple-500/5 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-purple-300 mb-8">
              Intelligence as a Service
            </span>
            <h1 className="font-heading font-bold tracking-tight leading-[1.05] mb-6" style={{ fontSize: 'clamp(2.6rem, 6vw, 4.6rem)' }}>
              Rent a specialized consultant.
            </h1>
            <p className="text-muted-foreground text-lg md:text-xl leading-relaxed max-w-2xl mx-auto">
              Stop paying by the token. Rent a customized, data-backed expert designed to compound your workflow.
            </p>
          </div>

          <PricingCards />
        </section>

        <footer className="border-t border-border py-8">
          <div className="mx-auto max-w-7xl px-6 flex items-center justify-between text-xs text-muted-foreground">
            <span>&copy; {new Date().getFullYear()} Lattice OS. All rights reserved.</span>
            <span>Intelligence as a Service</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
