"use client";

import React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface FeatureCardProps {
    label: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bgColor: string;
    delay?: number;
}

export const FeatureCard = ({ label, description, icon: Icon, color, bgColor, delay = 0 }: FeatureCardProps) => {
    return (
        <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay }}
            viewport={{ once: true, margin: "-50px" }}
            className={cn(
                "group relative p-6 rounded-2xl overflow-hidden transition-all duration-300",
                // Light mode: frosted glass — white/60 bg, white/80 border, subtle shadow
                "bg-white/60 backdrop-blur-sm border border-white/80 shadow-sm",
                "hover:bg-white/80 hover:shadow-md hover:border-white",
                // Dark mode overrides
                "dark:bg-white/5 dark:border-white/5 dark:shadow-none",
                "dark:hover:bg-white/10 dark:hover:shadow-none dark:hover:border-white/10",
            )}
        >
            {/* Hover gradient overlay */}
            <div className="absolute inset-0 bg-gradient-to-br from-violet-50/50 to-transparent dark:from-white/5 dark:to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            {/* Icon container */}
            <div className={cn(
                "w-12 h-12 rounded-lg flex items-center justify-center mb-4 transition-transform group-hover:scale-110 relative z-10",
                bgColor
            )}>
                <Icon className={cn("w-6 h-6", color)} />
            </div>

            {/* Title */}
            <h3 className="text-xl font-bold text-slate-800 dark:text-white mb-2 relative z-10 font-heading">
                {label}
            </h3>

            {/* Description */}
            <p className="text-slate-500 dark:text-muted-foreground text-sm leading-relaxed relative z-10 group-hover:text-slate-600 dark:group-hover:text-gray-300 transition-colors">
                {description}
            </p>
        </motion.div>
    );
};
