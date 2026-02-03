"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRightIcon } from "@radix-ui/react-icons";
import { LandingChat } from "@/components/landing-chat";
import { useProModal } from "@/hooks/use-pro-modal";

const capabilities = [
    { text: "Conversations", gradient: "from-sky-400 to-blue-500" },
    { text: "Images", gradient: "from-purple-400 to-pink-500" },
    { text: "Videos", gradient: "from-pink-500 to-red-500" },
    { text: "Music", gradient: "from-orange-400 to-red-500" },
    { text: "Code", gradient: "from-green-400 to-emerald-500" },
];

const AnimatedCapabilities = () => {
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % capabilities.length);
        }, 2000);
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="h-12 flex items-center justify-center">
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentIndex}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.5 }}
                    className="text-2xl font-semibold"
                >
                    <span className={`text-transparent bg-clip-text bg-gradient-to-r ${capabilities[currentIndex].gradient}`}>
                        {capabilities[currentIndex].text}
                    </span>
                </motion.div>
            </AnimatePresence>
        </div>
    );
};

export const HeroSection = () => {
    const proModal = useProModal();
    const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

    useEffect(() => {
        const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
        setPrefersReducedMotion(mediaQuery.matches);

        const handler = (e: MediaQueryListEvent) => setPrefersReducedMotion(e.matches);
        mediaQuery.addEventListener('change', handler);
        return () => mediaQuery.removeEventListener('change', handler);
    }, []);

    const animationProps = prefersReducedMotion
        ? { initial: {}, animate: {}, transition: {} }
        : { initial: { opacity: 0, y: 20 }, animate: { opacity: 1, y: 0 } };

    return (
        <section className="relative pt-20 pb-32 overflow-hidden">
            {/* Background Gradients */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-[-20%] left-[-10%] w-[600px] h-[600px] rounded-full bg-primary/5 blur-[100px]" />
                <div className="absolute bottom-[-10%] right-[-5%] w-[500px] h-[500px] rounded-full bg-purple-500/5 blur-[100px]" />
            </div>

            <div className="container relative z-10 mx-auto px-4 text-center">
                <motion.h1
                    {...animationProps}
                    transition={{ duration: 0.5 }}
                    className="text-5xl md:text-7xl font-bold tracking-tight text-white mb-6 font-heading"
                >
                    Unleash Your <br />
                    <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-red-500 animate-gradient-x">
                        Creative Potential
                    </span>
                </motion.h1>

                <motion.p
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.2 }}
                    className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed"
                >
                    Generate content, write code, compose music, and create videos in seconds.
                    Streamline your workflow with the smartest AI assistant ever built.
                </motion.p>

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.3 }}
                    className="flex flex-col sm:flex-row gap-4 justify-center items-center"
                >
                    <Link href="/dashboard">
                        <Button size="lg" className="rounded-full px-8 py-6 text-base shadow-[0_0_20px_-5px_rgba(168,85,247,0.5)] hover:shadow-[0_0_25px_-5px_rgba(168,85,247,0.6)] transition-all duration-300">
                            Get Started Free
                            <ArrowRightIcon className="ml-2 w-5 h-5" />
                        </Button>
                    </Link>
                    <Button
                        onClick={proModal.onOpen}
                        variant="outline"
                        size="lg"
                        className="rounded-full px-8 py-6 text-base border-white/10 bg-white/5 hover:bg-white/10 backdrop-blur-sm"
                    >
                        Support Genie
                    </Button>
                </motion.div>

                {/* Mobile-Only Captivating Animation */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ duration: 1, delay: 0.6 }}
                    className="md:hidden mt-16 relative h-[300px] flex items-center justify-center"
                >
                    {/* Floating Orbs */}
                    <motion.div
                        animate={{
                            y: [0, -20, 0],
                            scale: [1, 1.1, 1],
                        }}
                        transition={{
                            duration: 4,
                            repeat: Infinity,
                            ease: "easeInOut",
                        }}
                        className="absolute top-10 left-8 w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 blur-xl opacity-60"
                    />
                    <motion.div
                        animate={{
                            y: [0, 25, 0],
                            scale: [1, 1.15, 1],
                        }}
                        transition={{
                            duration: 5,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: 0.5,
                        }}
                        className="absolute bottom-10 right-8 w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 blur-xl opacity-60"
                    />
                    <motion.div
                        animate={{
                            y: [0, -15, 0],
                            scale: [1, 1.2, 1],
                        }}
                        transition={{
                            duration: 4.5,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: 1,
                        }}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-32 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 blur-2xl opacity-40"
                    />

                    {/* Animated Text Showcase */}
                    <div className="relative z-10 text-center px-6">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.8, delay: 0.8 }}
                            className="space-y-4"
                        >
                            <motion.div
                                animate={{
                                    opacity: [0.5, 1, 0.5],
                                }}
                                transition={{
                                    duration: 3,
                                    repeat: Infinity,
                                    ease: "easeInOut",
                                }}
                                className="text-4xl font-bold"
                            >
                                <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-500 to-red-500">
                                    AI-Powered
                                </span>
                            </motion.div>

                            <AnimatedCapabilities />

                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                transition={{ delay: 1.2 }}
                                className="text-sm text-muted-foreground"
                            >
                                All in one platform
                            </motion.div>
                        </motion.div>
                    </div>

                    {/* Pulsing Ring Effect */}
                    <motion.div
                        animate={{
                            scale: [1, 1.2, 1],
                            opacity: [0.3, 0.1, 0.3],
                        }}
                        transition={{
                            duration: 3,
                            repeat: Infinity,
                            ease: "easeInOut",
                        }}
                        className="absolute inset-0 m-auto w-40 h-40 rounded-full border-2 border-purple-500/30"
                    />
                    <motion.div
                        animate={{
                            scale: [1, 1.3, 1],
                            opacity: [0.2, 0.05, 0.2],
                        }}
                        transition={{
                            duration: 3,
                            repeat: Infinity,
                            ease: "easeInOut",
                            delay: 0.5,
                        }}
                        className="absolute inset-0 m-auto w-52 h-52 rounded-full border-2 border-blue-500/20"
                    />
                </motion.div>

                {/* Dashboard Mockup Halo Effect */}
                <motion.div
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.8, delay: 0.5 }}
                    className="mt-20 relative mx-auto max-w-5xl rounded-xl border border-white/10 bg-black/40 backdrop-blur-md shadow-2xl p-2 md:p-4"
                >
                    <div className="absolute -inset-1 bg-gradient-to-r from-purple-500 to-blue-500 rounded-xl blur opacity-20" />
                    <div className="relative rounded-lg overflow-hidden bg-[#0f1117]/50 flex items-center justify-center border border-white/5 p-1">
                        <LandingChat />
                    </div>
                </motion.div>
            </div>
        </section>
    );
};
