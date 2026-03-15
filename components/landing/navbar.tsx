"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { CheckIcon, Cross2Icon, FileTextIcon, QuestionMarkCircledIcon, StarFilledIcon, EnterIcon, RocketIcon } from "@radix-ui/react-icons";
import { Slack, Sun, Moon } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";

export const LandingNavbar = () => {
    const t = useTranslations("Landing");
    const tHero = useTranslations("Landing.hero");
    const [isOpen, setIsOpen] = useState(false);
    const [isPricingOpen, setIsPricingOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const pathname = usePathname();
    const router = useRouter();
    const { isDark, toggleTheme } = useTheme();

    const pricingTiers = [
        {
            name: t('pricing.payAsYouGo'),
            price: "$0.10",
            unit: "per video",
            description: t('pricing.subtitle'),
            features: ["No monthly subscription", "Access to all models", "Standard generation speed"],
            popular: false,
        },
        {
            name: t('pricing.creatorBundle'),
            price: "$1.00",
            unit: "per 10 videos",
            description: t('pricing.subtitle'),
            features: ["10 Credits included", "Priority support", "High-res downloads"],
            popular: true,
        },
        {
            name: t('pricing.proStudio'),
            price: "$9.00",
            unit: "per 100 videos",
            description: t('pricing.subtitle'),
            features: ["100 Credits included", "Fastest generation speed", "Commercial usage rights"],
            popular: false,
        },
    ];

    const navLinks = [
        { href: "/blog", label: "Blog", icon: FileTextIcon },
        { href: "/slack", label: "Slack", icon: Slack },
        { href: "/support", label: "Support", icon: QuestionMarkCircledIcon },
    ];

    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        const handleScroll = () => setScrolled(window.scrollY > 10);
        window.addEventListener("scroll", handleScroll);
        return () => window.removeEventListener("scroll", handleScroll);
    }, []);

    // Close mobile menu on route change
    useEffect(() => {
        setIsOpen(false);
    }, [pathname]);

    // Animation variants
    const menuVariants: Variants = {
        closed: {
            opacity: 0,
            y: "-10%",
            transition: { duration: 0.2, ease: "easeInOut" }
        },
        open: {
            opacity: 1,
            y: 0,
            transition: { duration: 0.3, ease: "easeOut" }
        },
    };

    const itemVariants: Variants = {
        closed: { opacity: 0, y: 10 },
        open: { opacity: 1, y: 0, transition: { duration: 0.3 } },
    };

    const Sparkles = () => {
        const sparkles = Array.from({ length: 25 });
        return (
            <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
                {sparkles.map((_, i) => (
                    <motion.div
                        key={i}
                        className="absolute w-1 h-1 bg-white rounded-full"
                        initial={{
                            opacity: 0,
                            scale: 0,
                            x: Math.random() * 100 + "%",
                            y: Math.random() * 100 + "%",
                        }}
                        animate={{
                            opacity: [0, 1, 0],
                            scale: [0, 1, 0],
                        }}
                        transition={{
                            duration: 2 + Math.random() * 3,
                            repeat: Infinity,
                            delay: Math.random() * 5,
                            ease: "easeInOut",
                        }}
                        style={{
                            boxShadow: "0 0 8px 1px rgba(255, 255, 255, 0.4)",
                        }}
                    />
                ))}
            </div>
        );
    };

    // Theme toggle button — Sun/Moon with smooth swap
    const ThemeToggle = ({ className }: { className?: string }) => (
        <button
            onClick={toggleTheme}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className={cn(
                "relative w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300",
                "border",
                isDark
                    ? "border-white/10 bg-white/5 hover:bg-white/15 text-gray-300 hover:text-white"
                    : "border-slate-200 bg-white/70 hover:bg-white shadow-sm text-slate-500 hover:text-slate-800",
                className
            )}
        >
            <AnimatePresence mode="wait" initial={false}>
                {isDark ? (
                    <motion.span
                        key="moon"
                        initial={{ opacity: 0, rotate: -30, scale: 0.7 }}
                        animate={{ opacity: 1, rotate: 0, scale: 1 }}
                        exit={{ opacity: 0, rotate: 30, scale: 0.7 }}
                        transition={{ duration: 0.2 }}
                    >
                        <Moon className="w-4 h-4" />
                    </motion.span>
                ) : (
                    <motion.span
                        key="sun"
                        initial={{ opacity: 0, rotate: 30, scale: 0.7 }}
                        animate={{ opacity: 1, rotate: 0, scale: 1 }}
                        exit={{ opacity: 0, rotate: -30, scale: 0.7 }}
                        transition={{ duration: 0.2 }}
                    >
                        <Sun className="w-4 h-4" />
                    </motion.span>
                )}
            </AnimatePresence>
        </button>
    );

    // Check if current route should hide navbar on desktop
    const isHiddenOnDesktop = ["/blog", "/support", "/slack", "/privacy"].some(path => pathname.includes(path));

    return (
        <>
            <header
                className={cn(
                    "fixed md:absolute top-0 left-0 right-0 z-50 transition-all duration-300 border-b",
                    isHiddenOnDesktop && "md:hidden",
                    scrolled || isOpen
                        ? "bg-white/80 dark:bg-[#0f1117]/80 backdrop-blur-xl border-slate-200/80 dark:border-white/10"
                        : "bg-transparent border-transparent"
                )}
            >
                <div className="max-w-7xl mx-auto px-4 md:px-10 flex justify-between items-center h-16">
                    {/* Logo */}
                    <Link href="/" className="flex items-center gap-3 z-50 relative group">
                        <div className="relative w-9 h-9 flex-shrink-0 transition-transform group-hover:scale-110 duration-300">
                            <Image
                                src="/Genie.png"
                                alt="Genie Logo"
                                fill
                                className="object-cover"
                            />
                        </div>
                        <span className="text-xl font-bold text-slate-800 dark:text-white tracking-tight font-heading leading-none group-hover:text-violet-600 dark:group-hover:text-purple-400 transition-colors">
                            Genie AI
                        </span>
                    </Link>

                    {/* Desktop Navigation */}
                    <nav className="hidden md:flex items-center gap-8">
                        <div className="flex items-center gap-6 text-sm font-medium text-slate-500 dark:text-gray-300">
                            {navLinks.map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className="hover:text-slate-900 dark:hover:text-white transition-colors"
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </div>

                        <div className="flex items-center gap-3">
                            <Button
                                onClick={() => setIsPricingOpen(true)}
                                variant="ghost"
                                className="text-slate-500 dark:text-gray-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-full"
                            >
                                Pricing
                            </Button>
                            <Link href="/dashboard">
                                <Button
                                    variant="ghost"
                                    className="text-slate-700 dark:text-white hover:bg-slate-100 dark:hover:bg-white/10 rounded-full"
                                >
                                    {tHero("login")}
                                </Button>
                            </Link>
                            <Link href="/dashboard">
                                <Button className="bg-gradient-to-r from-violet-600 to-indigo-600 dark:from-white dark:to-white text-white dark:text-black hover:opacity-90 dark:hover:bg-gray-200 rounded-full font-semibold shadow-lg shadow-violet-500/20 dark:shadow-white/10 transition-all hover:scale-105">
                                    {tHero("cta")}
                                </Button>
                            </Link>
                            {/* Theme Toggle */}
                            {mounted && <ThemeToggle />}
                        </div>
                    </nav>

                    {/* Mobile: Theme Toggle + Hamburger */}
                    <div className="md:hidden flex items-center gap-2 z-50">
                        {mounted && <ThemeToggle />}
                        <button
                            onClick={() => setIsOpen(!isOpen)}
                            className="relative w-10 h-10 flex flex-col justify-center items-end gap-[5px] group"
                            aria-label="Toggle menu"
                        >
                            <motion.span
                                animate={isOpen ? { rotate: 45, y: 7 } : { rotate: 0, y: 0 }}
                                className="w-8 h-[3px] rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"
                            />
                            <motion.span
                                animate={isOpen ? { opacity: 0 } : { opacity: 1 }}
                                className="w-5 h-[3px] bg-slate-600 dark:bg-white rounded-full group-hover:w-8 transition-all duration-300"
                            />
                            <motion.span
                                animate={isOpen ? { rotate: -45, y: -7 } : { rotate: 0, y: 0 }}
                                className="w-8 h-[3px] rounded-full bg-gradient-to-r from-purple-500 to-indigo-500"
                            />
                        </button>
                    </div>
                </div>
            </header>

            {/* Mobile Dropdown Menu (Portal) */}
            {mounted && createPortal(
                <AnimatePresence>
                    {isOpen && (
                        <motion.div
                            key="mobile-menu"
                            initial="closed"
                            animate="open"
                            exit="closed"
                            variants={menuVariants}
                            className="fixed inset-0 bg-[#FAF9F7] dark:bg-[#0f1117] z-[40] flex flex-col pt-24 px-6 overflow-hidden"
                        >
                            {/* Background Elements */}
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(139,92,246,0.08),transparent_70%)] dark:bg-[radial-gradient(circle_at_50%_40%,rgba(76,29,149,0.15),transparent_70%)] pointer-events-none z-0" />
                            <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-b from-violet-500/5 dark:from-purple-500/5 to-transparent pointer-events-none z-0" />

                            <div className="z-10 relative w-full h-full dark:block hidden">
                                <Sparkles />
                            </div>

                            <div className="absolute inset-0 flex flex-col items-center pt-24 w-full max-w-sm mx-auto z-50 pointer-events-auto">
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
                                    className="flex flex-col items-center w-full space-y-3"
                                >
                                    {navLinks.map((link) => {
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
                                                    <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-gradient-to-br dark:from-white/5 dark:to-white/[0.02] backdrop-blur-xl p-4 transition-all duration-300 hover:border-violet-300 dark:hover:border-purple-500/50 hover:bg-violet-50 dark:hover:bg-white/10 hover:shadow-[0_0_20px_-8px_rgba(139,92,246,0.4)] dark:hover:shadow-[0_0_30px_-5px_rgba(168,85,247,0.5)] hover:scale-[1.02] active:scale-[0.98]">
                                                        <div className="absolute inset-0 bg-gradient-to-r from-violet-500/0 via-violet-500/5 to-indigo-500/0 dark:from-purple-500/0 dark:via-purple-500/10 dark:to-pink-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                                                        <div className="relative flex items-center justify-center gap-3">
                                                            <Icon className="w-6 h-6 text-violet-500 dark:text-purple-400 group-hover:text-indigo-600 dark:group-hover:text-pink-400 transition-colors duration-300" />
                                                            <span className="text-2xl font-semibold text-slate-700 dark:text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-violet-600 group-hover:to-indigo-600 dark:group-hover:from-purple-400 dark:group-hover:to-pink-400 transition-all duration-300">
                                                                {link.label}
                                                            </span>
                                                        </div>

                                                        <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/40 dark:via-white/20 to-transparent" />
                                                    </div>
                                                </Link>
                                            </motion.div>
                                        );
                                    })}

                                    <motion.div variants={itemVariants} className="w-full flex items-center justify-center my-2">
                                        <div className="h-px bg-gradient-to-r from-transparent via-slate-200 dark:via-white/20 to-transparent w-full" />
                                    </motion.div>

                                    <motion.div variants={itemVariants} className="w-full">
                                        <button
                                            onClick={() => {
                                                setIsOpen(false);
                                                setIsPricingOpen(true);
                                            }}
                                            className="group relative block w-full"
                                        >
                                            <div className="relative overflow-hidden rounded-2xl border-2 border-violet-300/50 dark:border-purple-500/30 bg-gradient-to-br from-violet-50 to-indigo-50 dark:from-purple-500/10 dark:to-pink-500/10 backdrop-blur-xl p-4 transition-all duration-300 hover:border-violet-500 dark:hover:border-purple-500 hover:shadow-[0_0_30px_-8px_rgba(139,92,246,0.4)] dark:hover:shadow-[0_0_40px_-5px_rgba(168,85,247,0.6)] hover:scale-[1.02] active:scale-[0.98]">
                                                <div className="absolute inset-0 bg-gradient-to-r from-violet-500/10 via-indigo-500/10 to-violet-500/10 dark:from-purple-500/20 dark:via-pink-500/20 dark:to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                                                <div className="relative flex items-center justify-center gap-3">
                                                    <StarFilledIcon className="w-6 h-6 text-violet-500 dark:text-purple-400 group-hover:text-indigo-600 dark:group-hover:text-pink-400 transition-colors" />
                                                    <span className="text-2xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-violet-600 to-indigo-600 dark:from-purple-400 dark:to-pink-400">
                                                        Pricing
                                                    </span>
                                                </div>

                                                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/40 dark:via-white/20 to-transparent" />
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
                                            <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-white/10 bg-white/80 dark:bg-white/5 backdrop-blur-xl p-4 transition-all duration-300 hover:border-slate-300 dark:hover:border-white/30 hover:bg-slate-50 dark:hover:bg-white/10 hover:shadow-[0_0_20px_-8px_rgba(0,0,0,0.15)] dark:hover:shadow-[0_0_25px_-5px_rgba(255,255,255,0.3)] hover:scale-[1.02] active:scale-[0.98]">
                                                <div className="relative flex items-center justify-center gap-3">
                                                    <EnterIcon className="w-6 h-6 text-slate-400 dark:text-gray-300 group-hover:text-slate-700 dark:group-hover:text-white transition-colors" />
                                                    <span className="text-2xl font-semibold text-slate-600 dark:text-gray-100 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">
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
                                            <Button className="group relative w-full overflow-hidden bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white border-0 hover:scale-[1.02] active:scale-[0.98] transition-all duration-300 h-14 rounded-2xl text-lg font-bold shadow-2xl shadow-violet-500/30 hover:shadow-violet-500/50">
                                                <div className="absolute inset-0 bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
                                                <span className="relative flex items-center justify-center gap-2">
                                                    <RocketIcon className="w-5 h-5" />
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

            {/* Pricing Modal */}
            <AnimatePresence>
                {isPricingOpen && (
                    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
                        {/* Backdrop */}
                        <div
                            className="absolute inset-0 bg-black/60 dark:bg-black/80 backdrop-blur-sm transition-opacity"
                            onClick={() => setIsPricingOpen(false)}
                        />

                        {/* Modal Content */}
                        <div className="relative w-full max-w-lg bg-white dark:bg-[#0f1117] border border-slate-200 dark:border-white/10 sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-10 fade-in duration-300">
                            <div className="p-6 border-b border-slate-100 dark:border-white/10 flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-bold text-slate-800 dark:text-white font-heading">{t('pricing.title')}</h2>
                                    <p className="text-sm text-slate-500 dark:text-gray-400">{t('pricing.subtitle')}</p>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setIsPricingOpen(false)}
                                    className="text-slate-400 dark:text-gray-400 hover:text-slate-700 dark:hover:text-white rounded-full hover:bg-slate-100 dark:hover:bg-white/10"
                                >
                                    <Cross2Icon className="w-5 h-5" />
                                </Button>
                            </div>

                            <div className="p-6 overflow-y-auto space-y-4 custom-scrollbar">
                                {pricingTiers.map((tier, index) => (
                                    <div
                                        key={index}
                                        className={cn(
                                            "relative p-4 rounded-xl border cursor-pointer transition-all duration-300",
                                            tier.popular
                                                ? "border-violet-400 dark:border-purple-500 bg-violet-50 dark:bg-purple-500/10 shadow-[0_0_20px_-5px_rgba(139,92,246,0.3)] dark:shadow-[0_0_20px_-5px_rgba(168,85,247,0.4)]"
                                                : "border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 hover:bg-slate-100 dark:hover:bg-white/10 hover:border-slate-300 dark:hover:border-white/20"
                                        )}
                                    >
                                        {tier.popular && (
                                            <div className="absolute -top-3 right-4 px-2 py-0.5 bg-violet-600 text-white text-[10px] font-bold uppercase tracking-wide rounded-full shadow-lg">
                                                Most Popular
                                            </div>
                                        )}
                                        <div className="flex justify-between items-center mb-2">
                                            <h3 className="font-semibold text-slate-800 dark:text-white">{tier.name}</h3>
                                            <div className="text-right">
                                                <span className="text-lg font-bold text-slate-800 dark:text-white">{tier.price}</span>
                                                <span className="text-xs text-slate-400 dark:text-gray-400 block">{tier.unit}</span>
                                            </div>
                                        </div>
                                        <p className="text-sm text-slate-500 dark:text-gray-400 mb-3">{tier.description}</p>
                                        <ul className="space-y-2">
                                            {tier.features.map((feat, i) => (
                                                <li key={i} className="flex items-center text-xs text-slate-600 dark:text-gray-300">
                                                    <CheckIcon className="w-3.5 h-3.5 mr-2 text-green-500 dark:text-green-400" />
                                                    {feat}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>

                            <div className="p-6 border-t border-slate-100 dark:border-white/10 bg-slate-50/50 dark:bg-black/20 sm:rounded-b-2xl">
                                <Link href="/dashboard" className="w-full">
                                    <Button className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:opacity-90 text-white font-semibold py-6 rounded-xl text-lg shadow-lg shadow-violet-500/20">
                                        {t('pricing.startCreating')}
                                    </Button>
                                </Link>
                                <p className="text-center text-xs text-slate-400 dark:text-gray-500 mt-3">
                                    {t('pricing.disclaimer')}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </AnimatePresence>
        </>
    );
};
