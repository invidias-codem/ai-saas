"use client";

import { motion } from "framer-motion";

const testimonials = [
    {
        quote: "Genie has completely transformed how I create content for my social media channels.",
        name: "Alex R.",
        role: "Content Creator",
        initials: "AR",
        gradient: "from-purple-500 to-blue-500"
    },
    {
        quote: "The code generation tool saves me hours of debugging every single week. Highly recommend.",
        name: "Sarah J.",
        role: "Software Engineer",
        initials: "SJ",
        gradient: "from-pink-500 to-orange-500"
    },
    {
        quote: "I use the image generator for all my presentation decks. The quality is unmatched.",
        name: "David K.",
        role: "Product Manager",
        initials: "DK",
        gradient: "from-green-400 to-emerald-600"
    }
];

export const Testimonials = () => {
    return (
        <section className="py-24 border-t border-white/5 bg-black/20 relative overflow-hidden">
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
                    <h2 className="text-3xl md:text-5xl font-bold text-white mb-4 font-heading">Trusted by Creators</h2>
                    <p className="text-muted-foreground text-lg">Join thousands of professionals using Genie AI.</p>
                </motion.div>

                <div className="grid md:grid-cols-3 gap-8">
                    {testimonials.map((item, i) => (
                        <motion.div
                            key={i}
                            initial={{ opacity: 0, y: 20 }}
                            whileInView={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.5, delay: i * 0.1 }}
                            viewport={{ once: true }}
                            className="p-8 rounded-2xl bg-[#0f1117] border border-white/5 hover:border-white/10 transition-colors shadow-lg"
                        >
                            <p className="text-lg text-gray-300 mb-6 italic leading-relaxed">&quot;{item.quote}&quot;</p>
                            <div className="flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-full bg-gradient-to-tr ${item.gradient} flex items-center justify-center text-white font-bold text-sm`}>
                                    {item.initials}
                                </div>
                                <div>
                                    <p className="font-semibold text-white">{item.name}</p>
                                    <p className="text-sm text-gray-500">{item.role}</p>
                                </div>
                            </div>
                        </motion.div>
                    ))}
                </div>
            </div>
        </section>
    );
};
