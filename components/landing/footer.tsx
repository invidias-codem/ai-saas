import Link from "next/link";
import Image from "next/image";
import { TELEGRAM_BOT_URL, SUPPORT_URL } from "@/lib/constants/contact";

const GITHUB_PROFILE_URL = "https://github.com/invidias-codem";
const LINKEDIN_URL = "https://www.linkedin.com/in/joshua-jair-mohammed?utm_source=share_via&utm_content=profile&utm_medium=member_ios";

const NAV_LINKS = [
  { href: "/blog", label: "Blog" },
  { href: "/docs", label: "Docs" },
  { href: "/downloads", label: "Downloads" },
  { href: "/sovereign", label: "Sovereign" },
  { href: "/expert", label: "Experts" },
  { href: "/slack", label: "Slack" },
  { href: "/privacy", label: "Privacy" },
  { href: SUPPORT_URL, label: "Support" },
] as const;

const outlineLink = "inline-flex min-h-11 items-center rounded text-muted-foreground transition-colors hover:text-primary hover:underline";

export function LandingFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border bg-chrome py-8">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-10">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6">
          <Link href="/" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg">
            <div className="relative w-6 h-6">
              <Image src="/lattice-logo.png" alt="" fill className="object-contain" />
            </div>
            <span className="text-lg font-bold text-foreground">Lattice OS</span>
          </Link>

          <nav className="flex flex-wrap items-center justify-center gap-x-4 text-sm md:justify-end" aria-label="Footer">
            {NAV_LINKS.map((l) => (
              <Link key={l.href} href={l.href} className={outlineLink}>
                {l.label}
              </Link>
            ))}
            <a href={GITHUB_PROFILE_URL} target="_blank" rel="noreferrer" className={outlineLink}>
              GitHub
            </a>
            <a href={LINKEDIN_URL} target="_blank" rel="noreferrer" className={outlineLink}>
              LinkedIn
            </a>
            <a href={TELEGRAM_BOT_URL} target="_blank" rel="noreferrer" className={outlineLink}>
              Telegram
            </a>
          </nav>
        </div>

        <div className="mt-6 pt-6 border-t border-border text-center">
          <p className="text-muted-foreground text-sm">© {year} Lattice OS. All rights reserved.</p>
        </div>
      </div>
    </footer>
  );
}
