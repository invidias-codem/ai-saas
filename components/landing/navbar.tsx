"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronDown, Menu } from "lucide-react";

import { InstallButton } from "@/components/install/install-provider";
import { ModeToggle } from "@/components/mode-toggle";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { usePricingModal } from "@/lib/store/pricing-modal-store";
import { cn } from "@/lib/utils";

const primaryLinks = [
  { href: "/docs", label: "Docs" },
  { href: "/explore", label: "Explore" },
  { href: "/blog", label: "Blog" },
  { href: "/support", label: "Support" },
];

const moreLinks = [
  { href: "/downloads", label: "Downloads" },
  { href: "/expert", label: "Experts" },
  { href: "/sovereign", label: "Sovereign" },
  { href: "/slack", label: "Slack" },
  { href: "/blog/feed", label: "RSS" },
];

export function LandingNavbar() {
  const locale = useLocale();
  const t = useTranslations("Landing.hero");
  const pathname = usePathname();
  const moreButton = useRef<HTMLButtonElement>(null);
  const openPricing = usePricingModal((state) => state.open);
  const home = `/${locale}`;
  const dashboard = `${home}/dashboard`;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur-sm">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex min-h-16 w-full max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-10"
      >
        <Link href={home} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg font-semibold">
          <Image src="/lattice-logo.png" alt="" width={32} height={32} className="rounded-lg" />
          <span>Lattice OS</span>
        </Link>

        <div className="hidden items-center gap-1 lg:flex">
          {primaryLinks.map((link) => {
            const href = `${home}${link.href}`;
            const current = pathname === href ? "page" : pathname?.startsWith(`${href}/`) ? "location" : undefined;
            return (
              <Link
                key={href}
                href={href}
                aria-current={current}
                className={cn(
                  "inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium transition-colors",
                  current ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-chrome hover:text-foreground",
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          <InstallButton className="inline-flex min-h-11 items-center rounded-lg border border-input px-3 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground">
            Install
          </InstallButton>
          <ModeToggle className="h-11 w-11" />
          <DropdownMenu modal={false}>
            <DropdownMenuTrigger asChild>
              <Button
                ref={moreButton}
                type="button"
                variant="ghost"
                className="h-11 min-w-11 gap-1.5 rounded-lg px-2.5 text-muted-foreground"
                aria-label="More navigation links"
              >
                <Menu className="h-5 w-5 lg:hidden" aria-hidden="true" />
                <span className="hidden lg:inline">More</span>
                <ChevronDown className="hidden h-4 w-4 lg:inline" aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent
              align="end"
              collisionPadding={12}
              className="z-[45] max-h-[var(--radix-dropdown-menu-content-available-height)] w-64 overflow-y-auto p-1"
            >
              {primaryLinks.map((link) => (
                <DropdownMenuItem key={link.href} asChild className="min-h-11 px-3 lg:hidden">
                  <Link href={`${home}${link.href}`} aria-current={pathname === `${home}${link.href}` ? "page" : undefined}>
                    {link.label}
                  </Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator className="lg:hidden" />
              {moreLinks.map((link) => (
                <DropdownMenuItem key={link.href} asChild className="min-h-11 px-3">
                  <Link href={`${home}${link.href}`} aria-current={pathname === `${home}${link.href}` ? "page" : undefined}>
                    {link.label}
                  </Link>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="min-h-11 px-3" onSelect={() => openPricing(null, moreButton.current)}>
                Pricing
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="min-h-11 px-3">
                <Link href={dashboard}>{t("login")}</Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild className="min-h-11 px-3 text-primary xl:hidden">
                <Link href={dashboard}>{t("cta")}</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button asChild variant="outline" className="hidden h-11 rounded-lg text-primary xl:inline-flex">
            <Link href={dashboard}>{t("cta")}</Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}
