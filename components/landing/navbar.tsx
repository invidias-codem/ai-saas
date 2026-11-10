"use client";

import React, { useState, useCallback, useEffect, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname, useParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { FileTextIcon, QuestionMarkCircledIcon, EnterIcon, RocketIcon } from "@radix-ui/react-icons";
import { Rss, ShieldCheck as ShieldCheckIcon, Users as UsersIcon } from "lucide-react";
import { BrandIcon } from "@/lib/icons/brandIcons";
import { usePricingModal } from "@/lib/store/pricing-modal-store";
import { BlogNavLink } from "@/components/landing/blog-nav-link";
import { InstallButton } from "@/components/install/install-provider";

export const LandingNavbar = () => {
    const t = useTranslations("Landing");
    const tHero = useTranslations("Landing.hero");
    const [isOpen, setIsOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const pathname = usePathname();
    const router = useRouter();
    const { locale } = useParams() as { locale?: string };

    const isLandingPage = pathname === "/" || pathname === `/${locale}`;
    // Blog article pages render their own minimal reading-surface header.
    // Bail out here so we don't stack the full landing nav on top of it.
    const isBlogArticle = /^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?blog\/(?!series(?:\/|$)|feed(?:\/|$))[^/]+\/?$/.test(pathname ?? "");
    // Expert variant pages (the public homepage after middleware rewrite) use Mineral/Copper theme
    const isMineralCopper = /^\/(?:[a-z]{2}(?:-[A-Z]{2})?\/)?expert\/v\//.test(pathname ?? "");
    const { open: openPricingModal } = usePricingModal();

    const navLinks = [
        { href: "/blog", label: "Blog", icon: FileTextIcon },
        { href: `/${locale}/blog/feed`, label: "RSS", icon: Rss, external: false },
        { href: "/slack", label: "Slack", icon: () => <BrandIcon name="Slack" /> },
        { href: "/sovereign", label: "Sovereign", icon: ShieldCheckIcon, desktopOnly: true },
        { href: "/expert", label: "Experts", icon: UsersIcon, desktopOnly: true },
        { href: "/downloads", label: "Downloads", icon: RocketIcon },
        { href: "/support", label: "Support", icon: QuestionMarkCircledIcon },
    ];

    const mounted = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false
    );

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 10);
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    // Close mobile menu on route change
    useEffect(() => {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsOpen(false);
    }, [pathname]);

const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const menuVariants = {
    closed: {
        opacity: 0,
        y: "-8%",
        transition: { duration: 0.22, ease: EASE_IN_OUT }
    },
    open: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.28, ease: EASE_OUT }
    },
};

const itemVariants = {
    closed: { opacity: 0, y: 8 },
    open: { opacity: 1, y: 0, transition: { duration: 0.25 } },
};

    if (isBlogArticle) return null;

    const shellClass = isMineralCopper
      ? "mc-nav-shell"
      : "landing-nav-shell";
    const shellTopClass = isMineralCopper
      ? "mc-nav-shell-top"
      : "landing-nav-shell-top";

    return (
        <>
            <header
                className={cn(
                    "fixed md:absolute top-0 left-0 right-0 z-50 transition duration-200 border-b",
                    scrolled || isOpen ? shellClass : shellTopClass
                )}
            >
                <div className="max-w-7xl mx-auto px-4 md:px-10 flex justify-between items-center h-16">
                    <Link href="/" className="flex items-center gap-3 z-50 relative group min-h-[48px] min-w-[48px]">
                        <div className="relative w-9 h-9 flex-shrink-0 transition-transform group-hover:scale-110 duration-300">
                            <Image
                                src={isMineralCopper ? "/lattice-logo.png" : "/lattice-logo.png"}
                                alt="Lattice OS logo"
                                fill
                                className="object-cover"
                            />
                        </div>
                        <span className={cn(
                          "text-xl font-bold tracking-tight font-heading leading-none transition-colors group-hover:text-purple-400",
                          isMineralCopper ? "mc-logo-text group-hover:text-[#CD7A53]" : "landing-text-primary group-hover:text-purple-400"
                        )}>
                            Lattice OS
                        </span>
                    </Link>

                    <nav className="hidden md:flex items-center gap-8">
                        <div className="flex items-center gap-6 text-sm font-medium">
                            <BlogNavLink href="/blog" label="Blog" />
                            {navLinks.filter(l => l.label !== "Blog").map((link) => (
                                link.href === "/downloads" ? <InstallButton key={link.href} className={cn("min-h-[48px] inline-flex items-center transition", isMineralCopper ? "mc-nav-link" : "landing-nav-link")}>Install</InstallButton> :
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className={cn("min-h-[48px] inline-flex items-center transition", isMineralCopper ? "mc-nav-link" : "landing-nav-link")}
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </div>

                        <div className="flex items-center gap-3">
                            <Button
                                variant="ghost"
                                className={cn("rounded-full", isMineralCopper ? "mc-nav-ghost" : "landing-nav-ghost")}
                                onClick={() => openPricingModal()}
                            >
                                Pricing
                            </Button>
                            <Link href="/dashboard">
                                <Button
                                    variant="ghost"
                                    className={cn("rounded-full", isMineralCopper ? "mc-nav-ghost" : "landing-nav-ghost")}
                                >
                                    {tHero("login")}
                                </Button>
                            </Link>
                            <Link href="/dashboard">
                                <Button className={cn("min-h-[48px] rounded-full font-semibold shadow-lg transition duration-200 hover:scale-105", isMineralCopper ? "mc-cta-primary" : "landing-cta-primary dark:shadow-white/10")}>
                                    {tHero("cta")}
                                </Button>
                            </Link>
                        </div>
                    </nav>

                    <div className="md:hidden flex items-center gap-2 z-50">
                        <InstallButton className={cn("inline-flex min-h-[48px] items-center rounded-full border px-4 text-sm font-medium", isMineralCopper ? "border-[#C4D2C5] bg-[#FFFCF5] text-[#17271E] hover:border-[#286D50] hover:bg-[#EAEFE6]" : "landing-nav-link border-border")}>Install</InstallButton>
                        <button
                            onClick={() => setIsOpen(!isOpen)}
                            className="relative w-10 h-10 min-h-[48px] min-w-[48px] flex flex-col justify-center items-end gap-[5px] group"
                            aria-label="Toggle menu"
                        >
                            <motion.span
                                animate={isOpen ? { rotate: 45, y: 7 } : { rotate: 0, y: 0 }}
                                className={cn("w-8 h-[3px] rounded-full", isMineralCopper ? "bg-[#17271E]" : "bg-gradient-to-r from-indigo-500 to-purple-500")}
                            />
                            <motion.span
                                animate={isOpen ? { opacity: 0 } : { opacity: 1 }}
                                className={cn("w-5 h-[3px] rounded-full group-hover:w-8 transition duration-200", isMineralCopper ? "mc-nav-burger-mid" : "landing-nav-burger-mid")}
                            />
                            <motion.span
                                animate={isOpen ? { rotate: -45, y: -7 } : { rotate: 0, y: 0 }}
                                className={cn("w-8 h-[3px] rounded-full", isMineralCopper ? "bg-[#17271E]" : "bg-gradient-to-r from-purple-500 to-indigo-500")}
                            />
                        </button>
                    </div>
                </div>
            </header>

            {mounted && createPortal(
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            key="mobile-menu"
                            initial="closed"
                            animate="open"
                            exit="closed"
                            variants={menuVariants}
                            className={cn("fixed inset-0 z-[40] flex flex-col pt-24 px-6 overflow-hidden", isMineralCopper ? "mc-mobile-menu-bg" : "bg-background/95 backdrop-blur-md")}
                        >
                            <div className={cn("absolute inset-0 pointer-events-none z-0", isMineralCopper ? "bg-[radial-gradient(circle_at_50%_40%,rgba(205,122,83,0.15),transparent_70%)]" : "bg-[radial-gradient(circle_at_50%_40%,rgba(168,85,247,0.15),transparent_70%)]")} />
                            <div className={cn("absolute top-0 right-0 w-full h-full pointer-events-none z-0", isMineralCopper ? "bg-gradient-to-b from-[#CD7A53]/5 to-transparent" : "bg-gradient-to-b from-purple-500/5 to-transparent")} />

                            <div className="z-10 relative w-full h-full">
                                <Sparkles />
                            </div>

                            <div className="absolute inset-0 flex w-full max-w-sm flex-col items-center pt-24 mx-auto z-50 pointer-events-auto">
                                <motion.div
                                    variants={{
                                        closed: {},
                                        open: {
                                            transition: {
                                                staggerChildren: 0.08,
                                                delayChildren: 0.05
                                            }
                                        }
                                    }}
                                    initial="closed"
                                    animate="open"
                                    className="flex w-full flex-col items-center space-y-3"
                                >
                                    {navLinks.filter(l => !('desktopOnly' in l && l.desktopOnly)).map((link) => {
                                        const Icon = link.icon;
                                        return (
                                            <motion.div key={link.href} variants={itemVariants} className="w-full">
                                                <Link
                                                    href={link.href}
                                                    onClick={(e) => {
                                                        e.preventDefault();
                                                        setIsOpen(false);
                                                        router.push(link.href);
                                                    }}
                                                    className="group relative block w-full"
                                                >
                                                    <div className={cn("relative overflow-hidden rounded-2xl p-4 min-h-[48px] transition duration-200 hover:scale-[1.02] active:scale-[0.98]", isMineralCopper ? "mc-mobile-link" : "border border-border bg-card/60 backdrop-blur-xl hover:border-purple-500/50 hover:bg-accent/50 hover:shadow-[0_0_30px_-5px_rgba(168,85,247,0.3)]")}>
                                                        <div className={cn("absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300", isMineralCopper ? "bg-gradient-to-r from-[#CD7A53]/0 via-[#CD7A53]/5 to-[#D58A64]/0" : "bg-gradient-to-r from-purple-500/0 via-purple-500/5 to-pink-500/0")} />

                                                        <div className="relative flex items-center justify-center gap-3">
                                                            <Icon className={cn("h-6 w-6 transition-colors duration-300", isMineralCopper ? "mc-mobile-link-icon" : "text-purple-500 dark:text-purple-400 group-hover:text-pink-500 dark:group-hover:text-pink-400")} />
                                                            <span className={cn("text-2xl font-semibold transition duration-200", isMineralCopper ? "mc-mobile-link-text" : "text-foreground group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-purple-500 group-hover:to-pink-500")}>
                                                                {link.label}
                                                            </span>
                                                        </div>

                                                        <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-foreground/5 to-transparent" />
                                                    </div>
                                                </Link>
                                            </motion.div>
                                        );
                                    })}


                                    <motion.div variants={itemVariants} className="w-full flex items-center justify-center my-2">
                                        <div className={cn("h-px w-full", isMineralCopper ? "bg-gradient-to-r from-transparent via-[#C4D2C5] to-transparent" : "bg-gradient-to-r from-transparent via-white/20 to-transparent")} />
                                    </motion.div>

                                    <motion.div variants={itemVariants} className="w-full">
                                        <button
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setIsOpen(false);
                                                openPricingModal();
                                            }}
                                            className="group relative block w-full"
                                        >
                                            <div className={cn("relative overflow-hidden rounded-2xl p-4 min-h-[48px] transition duration-200 hover:scale-[1.02] active:scale-[0.98]", isMineralCopper ? "mc-mobile-pricing" : "border-2 border-purple-500/30 bg-gradient-to-br from-purple-500/5 to-pink-500/5 backdrop-blur-xl hover:border-purple-500 hover:shadow-[0_0_40px_-5px_rgba(168,85,247,0.4)]")}>
                                                <div className={cn("absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300", isMineralCopper ? "bg-gradient-to-r from-[#CD7A53]/10 via-[#D58A64]/10 to-[#CD7A53]/10" : "bg-gradient-to-r from-purple-500/10 via-pink-500/10 to-purple-500/10")} />

                                                <div className="relative flex items-center justify-center gap-3">
                                                    <span className={cn("text-2xl font-semibold", isMineralCopper ? "mc-mobile-pricing-text" : "text-transparent bg-clip-text bg-gradient-to-r from-purple-600 to-pink-600 dark:from-purple-400 dark:to-pink-400")}>
                                                        Pricing
                                                    </span>
                                                </div>

                                                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-foreground/5 to-transparent" />
                                            </div>
                                        </button>
                                    </motion.div>

                                    <motion.div variants={itemVariants} className="w-full">
                                        <Link
                                            href="/dashboard"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setIsOpen(false);
                                                router.push("/dashboard");
                                            }}
                                            className="group relative block w-full"
                                        >
                                            <div className={cn("relative overflow-hidden rounded-2xl p-4 min-h-[48px] transition duration-200 hover:scale-[1.02] active:scale-[0.98]", isMineralCopper ? "mc-mobile-login" : "border border-border bg-card hover:border-muted-foreground/30 hover:bg-accent hover:shadow-lg")}>
                                                <div className="relative flex items-center justify-center gap-3">
                                                    <EnterIcon className={cn("h-6 w-6 transition-colors", isMineralCopper ? "text-[#CD7A53]" : "text-muted-foreground group-hover:text-foreground")} />
                                                    <span className={cn("text-2xl font-semibold transition-colors", isMineralCopper ? "text-[#17271E]" : "text-foreground group-hover:text-foreground")}>
                                                        {tHero("login")}
                                                    </span>
                                                </div>
                                            </div>
                                        </Link>
                                    </motion.div>

                                    <motion.div variants={itemVariants} className="w-full mt-4">
                                        <Link
                                            href="/dashboard"
                                            onClick={(e) => {
                                                e.preventDefault();
                                                setIsOpen(false);
                                                router.push("/dashboard");
                                            }}
                                        >
                                            <Button className={cn("group relative h-14 w-full overflow-hidden rounded-2xl border-0 text-lg font-bold transition duration-200 hover:scale-[1.02] active:scale-[0.98]", isMineralCopper ? "mc-mobile-cta" : "landing-cta-primary shadow-2xl shadow-violet-500/30 hover:shadow-violet-500/50")}>
                                                <div className={cn("absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500", isMineralCopper ? "bg-gradient-to-r from-[#CD7A53] via-[#D58A64] to-[#CD7A53]" : "bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500")} />
                                                <span className="relative flex items-center justify-center gap-2">
                                                    <RocketIcon className="h-5 w-5" />
                                                    {tHero("cta")}
                                                </span>
                                                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-[2000ms] bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                                            </Button>
                                        </Link>
                                    </motion.div>
                                </motion.div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>,
                document.body
            )}
        </>
    );
}

// Module-scoped so its identity is stable across renders (react-hooks/static-components)
const SPARKLE_SEED = Array.from({ length: 25 }).map(() => ({
    x: Math.random() * 100,
    y: Math.random() * 100,
    duration: 2 + Math.random() * 3,
    delay: Math.random() * 5,
}));

function Sparkles() {
    const sparkles = Array.from({ length: 25 });
    const randomValues = SPARKLE_SEED;
    
    return (
        <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
            {sparkles.map((_, i) => {
                const rv = randomValues[i];
                return (
                    <motion.div
                        key={i}
                        className="absolute w-1 h-1 bg-white rounded-full"
                        initial={{ opacity: 0, scale: 0, x: `${rv.x}%`, y: `${rv.y}%` }}
                        animate={{ opacity: [0, 1, 0], scale: [0, 1, 0] }}
                        transition={{
                            duration: rv.duration,
                            repeat: Infinity,
                            delay: rv.delay,
                            ease: "easeInOut",
                        }}
                        style={{ boxShadow: "0 0 8px 1px rgba(255, 255, 255, 0.4)" }}
                    />
                );
            })}
        </div>
    );
};
