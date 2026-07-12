"use client";

import { motion } from "framer-motion";

const testimonials = [
    {
        quote: "I stopped explaining tools to peers and just showed them a conversation with memory. That’s the first AI product I’ve demoed and actually believed in.",
        name: "Mia R.",
        role: "Developer",
        initials: "MR",
        gradient: "from-purple-500 to-blue-500"
    },
    {
        quote: "The workspace isolation made onboarding a non-event. I could hand someone a project context without handoff horror.",
        name: "Daniel K.",
        role: "Product Lead",
        initials: "DK",
        gradient: "from-pink-500 to-orange-500"
    },
    {
        quote: "What sold me was reproducibility. The same task, same context, same reasoning quality—on a Raspberry Pi and in the notebook I already use.",
        name: "Samir P.",
        role: "Operations",
        initials: "SP",
        gradient: "from-green-400 to-emerald-600"
    }
];

export const Testimonials = () => {
    return (
        <section className="py-24 border-t border-border bg-muted/50 relative overflow-hidden">
            {/* Decorative elements */}
            <div className="absolute pointer-events-none top-0 left-1/2 -translate-x-1/2 w-full max-w-7xl h-full">
                <div className="absolute top-1/4 left-0 w-64 h-64 bg-purple-500/10 rounded-full blur-[80px]" />
                <div className="absolute bottom-1/4 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-[80px]" />
            </div>

            <div className="container px-4 mx-auto relative z-10">
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5 }}
                    className="text-center mb-16"
                >
                    <h2 className="text-3xl md:text-5xl font-bold text-foreground mb-4 font-heading">Trusted by Creators</h2>
                    <p className="text-muted-foreground text-lg">Join thousands of professionals using Lattice OS.</p>
                </motion.div>

                <div className="grid md:grid-cols-3 gap-8">
                    {testimonials.map((item, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: i * 0.1 }}
                            viewport={{ once: true }}
                            className="p-8 rounded-2xl bg-card border border-border hover:border-accent-foreground/20 transition-colors shadow-sm dark:shadow-none"
                        >
                            <p className="text-lg text-card-foreground mb-6 italic leading-relaxed">&quot;{item.quote}&quot;</p>
                            <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-full bg-gradient-to-tr ${item.gradient} flex items-center justify-center text-white font-bold text-sm`}>
                                    {item.initials}
                                </div>
                                <div>
                                    <p className="font-semibold text-foreground">{item.name}</p>
                                    <p className="text-sm text-muted-foreground">{item.role}</p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};
