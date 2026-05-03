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
import { Slack } from "lucide-react";

export const LandingNavbar = () => {
    const t = useTranslations("Landing");
    const tHero = useTranslations("Landing.hero");
    const [isOpen, setIsOpen] = useState(false);
    const [isPricingOpen, setIsPricingOpen] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const pathname = usePathname();
    const router = useRouter();

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

    useEffect(() => {
        setIsOpen(false);
    }, [pathname]);

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

    const isHiddenOnDesktop = ["/blog", "/support", "/slack", "/privacy"].some(path => pathname.includes(path));

    return (
        <>
            <header
                className={cn(
                    "fixed md:absolute top-0 left-0 right-0 z-50 transition-all duration-300 border-b",
                    isHiddenOnDesktop && "md:hidden",
                    scrolled || isOpen ? "landing-nav-shell" : "landing-nav-shell-top"
                )}
            >
                <div className="max-w-7xl mx-auto px-4 md:px-10 flex justify-between items-center h-16">
                    <Link href="/" className="flex items-center gap-3 z-50 relative group">
                        <div className="relative w-9 h-9 flex-shrink-0 transition-transform group-hover:scale-110 duration-300">
                            <Image
                                src="/Genie.png"
                                alt="Genie Logo"
                                fill
                                className="object-cover"
                            />
                        </div>
                        <span className="landing-text-primary text-xl font-bold tracking-tight font-heading leading-none transition-colors group-hover:text-purple-400">
                            Genie AI
                        </span>
                    </Link>

                    <nav className="hidden md:flex items-center gap-8">
                        <div className="flex items-center gap-6 text-sm font-medium">
                            {navLinks.map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className="landing-nav-link transition-colors"
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </div>

                        <div className="flex items-center gap-3">
                            <Button
                                onClick={() => setIsPricingOpen(true)}
                                variant="ghost"
                                className="landing-nav-ghost rounded-full"
                            >
                                Pricing
                            </Button>
                            <Link href="/dashboard">
                                <Button
                                    variant="ghost"
                                    className="landing-nav-ghost rounded-full"
                                >
                                    {tHero("login")}
                                </Button>
                            </Link>
                            <Link href="/dashboard">
                                <Button className="landing-cta-primary rounded-full font-semibold shadow-lg dark:shadow-white/10 transition-all hover:scale-105">
                                    {tHero("cta")}
                                </Button>
                            </Link>
                        </div>
                    </nav>

                    <div className="md:hidden flex items-center gap-2 z-50">
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
                                className="landing-nav-burger-mid w-5 h-[3px] rounded-full group-hover:w-8 transition-all duration-300"
                            />
                            <motion.span
                                animate={isOpen ? { rotate: -45, y: -7 } : { rotate: 0, y: 0 }}
                                className="w-8 h-[3px] rounded-full bg-gradient-to-r from-purple-500 to-indigo-500"
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
                            className="fixed inset-0 landing-bg-main z-[40] flex flex-col pt-24 px-6 overflow-hidden"
                        >
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(76,29,149,0.15),transparent_70%)] pointer-events-none z-0" />
                            <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-b from-purple-500/5 to-transparent pointer-events-none z-0" />

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
                                                    <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-white/[0.02] backdrop-blur-xl p-4 transition-all duration-300 hover:border-purple-500/50 hover:bg-white/10 hover:shadow-[0_0_30px_-5px_rgba(168,85,247,0.5)] hover:scale-[1.02] active:scale-[0.98]">
                                                        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/0 via-purple-500/10 to-pink-500/0 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                                                        <div className="relative flex items-center justify-center gap-3">
                                                            <Icon className="h-6 w-6 text-purple-400 group-hover:text-pink-400 transition-colors duration-300" />
                                                            <span className="text-2xl font-semibold text-white group-hover:text-transparent group-hover:bg-clip-text group-hover:bg-gradient-to-r group-hover:from-purple-400 group-hover:to-pink-400 transition-all duration-300">
                                                                {link.label}
                                                            </span>
                                                        </div>

                                                        <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                                                    </div>
                                                </Link>
                                            </motion.div>
                                        );
                                    })}

                                    <motion.div variants={itemVariants} className="w-full flex items-center justify-center my-2">
                                        <div className="h-px bg-gradient-to-r from-transparent via-white/20 to-transparent w-full" />
                                    </motion.div>

                                    <motion.div variants={itemVariants} className="w-full">
                                        <button
                                            onClick={() => {
                                                setIsOpen(false);
                                                setIsPricingOpen(true);
                                            }}
                                            className="group relative block w-full"
                                        >
                                            <div className="relative overflow-hidden rounded-2xl border-2 border-purple-500/30 bg-gradient-to-br from-purple-500/10 to-pink-500/10 backdrop-blur-xl p-4 transition-all duration-300 hover:border-purple-500 hover:shadow-[0_0_40px_-5px_rgba(168,85,247,0.6)] hover:scale-[1.02] active:scale-[0.98]">
                                                <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 via-pink-500/20 to-purple-500/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                                                <div className="relative flex items-center justify-center gap-3">
                                                    <StarFilledIcon className="h-6 w-6 text-purple-400 group-hover:text-pink-400 transition-colors" />
                                                    <span className="text-2xl font-semibold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                                                        Pricing
                                                    </span>
                                                </div>

                                                <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
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
                                            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-xl p-4 transition-all duration-300 hover:border-white/30 hover:bg-white/10 hover:shadow-[0_0_25px_-5px_rgba(255,255,255,0.3)] hover:scale-[1.02] active:scale-[0.98]">
                                                <div className="relative flex items-center justify-center gap-3">
                                                    <EnterIcon className="h-6 w-6 text-gray-300 group-hover:text-white transition-colors" />
                                                    <span className="text-2xl font-semibold text-gray-100 group-hover:text-white transition-colors">
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
                                            <Button className="landing-cta-primary group relative h-14 w-full overflow-hidden rounded-2xl border-0 text-lg font-bold transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] shadow-2xl shadow-violet-500/30 hover:shadow-violet-500/50">
                                                <div className="absolute inset-0 bg-gradient-to-r from-pink-500 via-purple-500 to-indigo-500 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
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

            <AnimatePresence>
                {isPricingOpen && (
                    <div className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4">
                        <div
                            className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
                            onClick={() => setIsPricingOpen(false)}
                        />

                        <div className="relative flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-2xl border border-white/10 bg-[#0f1117] shadow-2xl sm:rounded-2xl">
                            <div className="flex items-center justify-between border-b border-white/10 p-6">
                                <div>
                                    <h2 className="text-xl font-bold text-white font-heading">{t('pricing.title')}</h2>
                                    <p className="text-sm text-gray-400 mt-1">{t('pricing.subtitle')}</p>
                                </div>
                                <button
                                    onClick={() => setIsPricingOpen(false)}
                                    className="w-8 h-8 rounded-full bg-white/10 text-gray-300 hover:bg-white/20 transition-colors flex items-center justify-center"
                                    aria-label="Close pricing modal"
                                >
                                    <Cross2Icon className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="overflow-y-auto p-6 space-y-4">
                                {pricingTiers.map((tier) => (
                                    <div
                                        key={tier.name}
                                        className={cn(
                                            "relative rounded-2xl border p-5 transition-all duration-300",
                                            tier.popular
                                                ? "border-purple-500 bg-gradient-to-br from-purple-500/10 to-pink-500/10 shadow-lg shadow-purple-500/10"
                                                : "border-white/10 bg-white/5"
                                        )}
                                    >
                                        {tier.popular && (
                                            <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-gradient-to-r from-purple-500 to-pink-500 text-white text-xs font-bold">
                                                Most Popular
                                            </div>
                                        )}

                                        <div className="text-center mb-4">
                                            <h3 className="text-lg font-bold text-white mb-1">{tier.name}</h3>
                                            <div className="flex items-baseline justify-center gap-1">
                                                <span className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
                                                    {tier.price}
                                                </span>
                                                <span className="text-sm text-gray-400">{tier.unit}</span>
                                            </div>
                                            <p className="text-sm text-gray-400 mt-2">{tier.description}</p>
                                        </div>

                                        <ul className="space-y-2 mb-5">
                                            {tier.features.map((feature) => (
                                                <li key={feature} className="flex items-start gap-2 text-sm text-gray-300">
                                                    <CheckIcon className="w-4 h-4 text-purple-400 mt-0.5 flex-shrink-0" />
                                                    <span>{feature}</span>
                                                </li>
                                            ))}
                                        </ul>

                                        <Button
                                            className={cn(
                                                "w-full rounded-xl font-semibold",
                                                tier.popular
                                                    ? "landing-cta-primary"
                                                    : "landing-cta-secondary"
                                            )}
                                        >
                                            {t('pricing.startCreating')}
                                        </Button>
                                    </div>
                                ))}
                            </div>

                            <div className="border-t border-white/10 px-6 py-4">
                                <p className="text-xs text-gray-500 text-center">
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
