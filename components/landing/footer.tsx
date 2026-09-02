import Link from "next/link";
import Image from "next/image";
import { TELEGRAM_BOT_URL, SUPPORT_URL } from "@/lib/constants/contact";

const GITHUB_REPO_URL = "https://github.com/invidias-codem/ai-saas";

const NAV_LINKS = [
  { href: "/blog", label: "Blog" },
  { href: "/docs", label: "Docs" },
  { href: "/sovereign", label: "Sovereign" },
  { href: "/slack", label: "Slack" },
  { href: "/privacy", label: "Privacy" },
  { href: SUPPORT_URL, label: "Support" },
] as const;

const outlineLink = "min-h-[48px] inline-flex items-center transition text-muted-foreground hover:text-foreground";

export function LandingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-background py-10">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <Link href="/" className="flex items-center gap-2">
            <div className="relative w-6 h-6">
              <Image src="/lattice-logo.png" alt="Lattice OS logo" fill className="object-contain" />
            </div>
            <span className="text-lg font-bold text-foreground">Lattice OS</span>
          </Link>

          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-sm md:justify-end" aria-label="Footer">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={outlineLink}>
                {l.label}
              </Link>
            ))}
            <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer" className={outlineLink}>
              GitHub
            </a>
            <a href={TELEGRAM_BOT_URL} target="_blank" rel="noreferrer" className={outlineLink}>
              Telegram
            </a>
          </nav>
        </div>

        <div className="mt-8 pt-8 border-t border-border text-center">
          <p className="text-muted-foreground text-sm">© {year} Lattice OS. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
