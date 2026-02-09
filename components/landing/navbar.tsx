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
import { CheckIcon, Cross2Icon } from "@radix-ui/react-icons";

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
        { href: "/blog", label: "Blog" },
        { href: "/slack", label: "Slack" },
        { href: "/support", label: "Support" },
    ];

    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // ... (rest of effects)

    // Close mobile menu on route change
    useEffect(() => {
        setIsOpen(false);
    }, [pathname]);

    // ...

    // Golden Ratio constant
    const PHI = 1.618;

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

    // Check if current route should hide navbar on desktop
    const isHiddenOnDesktop = ["/blog", "/support", "/slack", "/privacy"].some(path => pathname.includes(path));

    return (
        <>
            <header
                className={cn( // Fixed mobile header, absolute desktop header
                    "fixed md:absolute top-0 left-0 right-0 z-50 transition-all duration-300 border-b",
                    // Hide on desktop for specific routes
                    isHiddenOnDesktop && "md:hidden",
                    // Scroll/Open state styles
                    scrolled || isOpen
                        ? "bg-[#0f1117]/80 backdrop-blur-xl border-white/10"
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
                        <span className="text-xl font-bold text-white tracking-tight font-heading leading-none group-hover:text-purple-400 transition-colors">
                            Genie AI
                        </span>
                    </Link>

                    {/* Desktop Navigation */}
                    <nav className="hidden md:flex items-center gap-8">
                        <div className="flex items-center gap-6 text-sm font-medium text-gray-300">
                            {navLinks.map((link) => (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className="hover:text-white transition-colors"
                                >
                                    {link.label}
                                </Link>
                            ))}
                        </div>

                        <div className="flex items-center gap-4">
                            <Button
                                onClick={() => setIsPricingOpen(true)}
                                variant="ghost"
                                className="text-gray-300 hover:text-white hover:bg-white/10 rounded-full"
                            >
                                Pricing
                            </Button>
                            <Link href="/dashboard">
                                <Button
                                    variant="ghost"
                                    className="text-white hover:bg-white/10 rounded-full"
                                >
                                    {tHero("login")}
                                </Button>
                            </Link>
                            <Link href="/dashboard">
                                <Button className="bg-white text-black hover:bg-gray-200 rounded-full font-semibold shadow-lg shadow-white/10 transition-transform hover:scale-105">
                                    {tHero("cta")}
                                </Button>
                            </Link>
                        </div>
                    </nav>

                    {/* Mobile HashMap Button */}
                    <button
                        onClick={() => setIsOpen(!isOpen)}
                        className="md:hidden z-50 relative w-10 h-10 flex flex-col justify-center items-end gap-[5px] group"
                        aria-label="Toggle menu"
                    >
                        <motion.span
                            animate={isOpen ? { rotate: 45, y: 7 } : { rotate: 0, y: 0 }}
                            className="w-8 h-[3px] bg-white rounded-full bg-gradient-to-r from-indigo-500 to-purple-500"
                        />
                        <motion.span
                            animate={isOpen ? { opacity: 0 } : { opacity: 1 }}
                            className="w-5 h-[3px] bg-white rounded-full group-hover:w-8 transition-all duration-300"
                        />
                        <motion.span
                            animate={isOpen ? { rotate: -45, y: -7 } : { rotate: 0, y: 0 }}
                            className="w-8 h-[3px] bg-white rounded-full bg-gradient-to-r from-purple-500 to-indigo-500"
                        />
                    </button>
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
                            className="fixed inset-0 bg-[#0f1117] z-[40] flex flex-col pt-24 px-6 overflow-hidden"
                        >
                            {/* Background Elements */}
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_40%,rgba(76,29,149,0.15),transparent_70%)] pointer-events-none z-0" />
                            <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-b from-purple-500/5 to-transparent pointer-events-none z-0" />

                            <div className="z-10 relative w-full h-full">
                                <Sparkles />
                            </div>

                            <div className="absolute inset-0 flex flex-col items-center pt-32 w-full max-w-sm mx-auto z-50 pointer-events-auto">
                                <motion.div
                                    variants={{
                                        closed: {},
                                        open: {
                                            transition: { staggerChildren: 0.1 }
                                        }
                                    }}
                                    initial="closed"
                                    animate="open"
                                    className="flex flex-col items-center w-full space-y-8"
                                >
                                    {navLinks.map((link) => (
                                        <motion.div key={link.href} variants={itemVariants} className="w-full">
                                            <Link
                                                href={link.href}
                                                onClick={(e) => {
                                                    e.preventDefault();
                                                    setIsOpen(false);
                                                    router.push(link.href);
                                                }}
                                                className="block text-center text-2xl font-medium text-white hover:text-purple-400 transition-colors py-2 drop-shadow-md"
                                            >
                                                {link.label}
                                            </Link>
                                        </motion.div>
                                    ))}

                                    <motion.div variants={itemVariants} className="w-full h-px bg-white/10 my-2" />

                                    <motion.div variants={itemVariants} className="w-full">
                                        <button
                                            onClick={() => {
                                                setIsOpen(false);
                                                setIsPricingOpen(true);
                                            }}
                                            className="block w-full text-center text-2xl font-medium text-white hover:text-purple-400 transition-colors py-2 drop-shadow-md"
                                        >
                                            Pricing
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
                                            className="block text-center text-2xl font-medium text-white hover:text-purple-400 transition-colors py-2 drop-shadow-md"
                                        >
                                            {tHero("login")}
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
                                            <Button className="w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 text-white border-0 hover:scale-[1.02] active:scale-[0.98] transition-transform h-14 rounded-2xl text-lg font-bold shadow-2xl shadow-purple-500/40">
                                                {tHero("cta")}
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
                {/* ... pricing modal content (unchanged) ... */}
                {isPricingOpen && (
                    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
                        {/* Backdrop */}
                        <div
                            className="absolute inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
                            onClick={() => setIsPricingOpen(false)}
                        />

                        {/* Modal Content */}
                        <div className="relative w-full max-w-lg bg-[#0f1117] border border-white/10 sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[90vh] animate-in slide-in-from-bottom-10 fade-in duration-300">
                            {/* ... content ... */}
                            <div className="p-6 border-b border-white/10 flex items-center justify-between">
                                <div>
                                    <h2 className="text-xl font-bold text-white font-heading">{t('pricing.title')}</h2>
                                    <p className="text-sm text-gray-400">{t('pricing.subtitle')}</p>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => setIsPricingOpen(false)}
                                    className="text-gray-400 hover:text-white rounded-full hover:bg-white/10"
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
                                                ? "border-purple-500 bg-purple-500/10 shadow-[0_0_20px_-5px_rgba(168,85,247,0.4)]"
                                                : "border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20"
                                        )}
                                    >
                                        {tier.popular && (
                                            <div className="absolute -top-3 right-4 px-2 py-0.5 bg-purple-600 text-white text-[10px] font-bold uppercase tracking-wide rounded-full shadow-lg">
                                                Most Popular
                                            </div>
                                        )}
                                        <div className="flex justify-between items-center mb-2">
                                            <h3 className="font-semibold text-white">{tier.name}</h3>
                                            <div className="text-right">
                                                <span className="text-lg font-bold text-white">{tier.price}</span>
                                                <span className="text-xs text-gray-400 block">{tier.unit}</span>
                                            </div>
                                        </div>
                                        <p className="text-sm text-gray-400 mb-3">{tier.description}</p>
                                        <ul className="space-y-2">
                                            {tier.features.map((feat, i) => (
                                                <li key={i} className="flex items-center text-xs text-gray-300">
                                                    <CheckIcon className="w-3.5 h-3.5 mr-2 text-green-400" />
                                                    {feat}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>
                                ))}
                            </div>

                            <div className="p-6 border-t border-white/10 bg-black/20 sm:rounded-b-2xl">
                                <Link href="/dashboard" className="w-full">
                                    <Button className="w-full bg-white text-black hover:bg-gray-200 font-semibold py-6 rounded-xl text-lg shadow-lg">
                                        {t('pricing.startCreating')}
                                    </Button>
                                </Link>
                                <p className="text-center text-xs text-gray-500 mt-3">
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
