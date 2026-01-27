"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { ArrowRightIcon } from "@radix-ui/react-icons";
import { LandingChat } from "@/components/landing-chat";
import { useProModal } from "@/hooks/use-pro-modal";

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
