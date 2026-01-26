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
            viewport={{ once: true }}
            className="group relative p-6 rounded-2xl border border-white/5 bg-white/5 hover:bg-white/10 transition-colors duration-300 backdrop-blur-sm overflow-hidden"
        >
            <div className="absolute inset-0 bg-gradient-to-br from-white/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className={cn("w-12 h-12 rounded-lg flex items-center justify-center mb-4 transition-transform group-hover:scale-110 relative z-10", bgColor)}>
                <Icon className={cn("w-6 h-6", color)} />
            </div>

            <h3 className="text-xl font-bold text-white mb-2 relative z-10 font-heading">{label}</h3>
            <p className="text-muted-foreground text-sm leading-relaxed relative z-10 group-hover:text-gray-300 transition-colors">
                {description}
            </p>
        </motion.div>
    );
};
