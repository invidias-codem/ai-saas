
import { LandingNavbar } from "@/components/landing/navbar";

export default function MarketingLayout({
    children
}: {
    children: React.ReactNode;
}) {
  return (
    <div className="bg-background min-h-screen flex flex-col">
      <LandingNavbar />
      <div className="flex-grow">
        {children}
      </div>
      <footer className="border-t border-border py-8">
        <div className="mx-auto flex max-w-7xl flex-wrap justify-center gap-x-8 gap-y-3 px-6 text-sm text-muted-foreground md:justify-end">
          <a href="/blog" className="min-h-[48px] inline-flex items-center transition hover:text-foreground">Blog</a>
          <a href="/docs" className="min-h-[48px] inline-flex items-center transition hover:text-foreground">Docs</a>
          <a href="/slack" className="min-h-[48px] inline-flex items-center transition hover:text-foreground">Slack</a>
          <a href="/sovereign" className="min-h-[48px] inline-flex items-center transition hover:text-foreground">Sovereign</a>
          <a href="/support" className="min-h-[48px] inline-flex items-center transition hover:text-foreground">Support</a>
        </div>
      </footer>
    </div>
  );
}
