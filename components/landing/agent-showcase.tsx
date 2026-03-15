"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import {
    FileTextIcon,
    DoubleArrowRightIcon,
    CheckCircledIcon,
    CopyIcon,
    ReloadIcon,
    LightningBoltIcon
} from "@radix-ui/react-icons";
import { Activity, Car, Sparkles, BrainCircuit } from "lucide-react";

// Types for our scenarios
type ScenarioType = "medical" | "mechanic";

interface Scenario {
    id: ScenarioType;
    icon: any;
    label: string;
    description: string;
    imageSrc: string; // Placeholder for now, we'll use CSS gradients/shapes if actual images unavailable
    userPrompt: string;
    steps: string[];
    finalResult: {
        title: string;
        savings: string;
        summary: string;
        content: string;
    };
}

const SCENARIOS: Record<ScenarioType, Scenario> = {
    medical: {
        id: "medical",
        icon: Activity,
        label: "Medical Bill",
        description: "Find overcharges & negotiate",
        imageSrc: "/bill-placeholder.png",
        userPrompt: "Is this medical bill accurate? I feel like I'm being overcharged for the 'Routine Visit'.",
        steps: [
            "Scanning document for CPT codes...",
            "Identifying CPT 99214 (Level 4 encounter)...",
            "Cross-referencing with CMS fee schedules...",
            "Detecting upcoding risk: Visit duration < 25 mins...",
            "Drafting negotiation script..."
        ],
        finalResult: {
            title: "Potential Savings Found",
            savings: "$350.00",
            summary: "Code 99214 appears incorrect for a 15-min checkup.",
            content: "I've detected a potential upcoding error. The provider billed CPT 99214 (Level 4), but your visit description matches CPT 99213 (Level 3).\n\n**Recommended Action:**\nRequest a coding review citing 'lack of medical complexity'. Use this script:\n\n'Hi, I reviewed my bill and noticed CPT 99214 was used. per CMS guidelines, my 15-minute visit aligns better with 99213. Can you please review this claim?'"
        }
    },
    mechanic: {
        id: "mechanic",
        icon: Car,
        label: "Car Repair",
        description: "Verify mechanic quotes",
        imageSrc: "/car-part-placeholder.png",
        userPrompt: "The mechanic quoted $800 for rear brake pads and rotors on my 2020 Honda Civic. Is this fair?",
        steps: [
            "Identifying vehicle: 2020 Honda Civic...",
            "Searching OEM & Aftermarket part prices...",
            "Analyzing local labor rates (avg $120/hr)...",
            "Calculating fair market value...",
            "Generating counter-offer..."
        ],
        finalResult: {
            title: "Quote is 30% Above Market",
            savings: "$210.00",
            summary: "Fair price range is $480 - $590.",
            content: "**Analysis:**\n- Parts (Quality Aftermarket): ~$250\n- Labor (2 hours @ $120/hr): ~$240\n- **Total Fair Price: ~$490**\n\nThe quoted $800 includes a heavy markup on parts (~200%).\n\n**Negotiation Tip:**\nAsk if you can supply your own parts or request a breakdown of the parts cost vs. MSRP."
        }
    }
};

export const AgentShowcase = () => {
    const [activeScenario, setActiveScenario] = useState<ScenarioType>("medical");
    const [status, setStatus] = useState<"idle" | "thinking" | "complete">("idle");
    const [currentStep, setCurrentStep] = useState(0);

    const scenario = SCENARIOS[activeScenario];

    // Reset when scenario changes
    useEffect(() => {
        setStatus("idle");
        setCurrentStep(0);
    }, [activeScenario]);

    const startSimulation = () => {
        setStatus("thinking");
        setCurrentStep(0);
    };

    // Thinking Loop
    useEffect(() => {
        if (status === "thinking") {
            if (currentStep < scenario.steps.length) {
                const timer = setTimeout(() => {
                    setCurrentStep(prev => prev + 1);
                }, 1200); // 1.2s per step
                return () => clearTimeout(timer);
            } else {
                // Done thinking
                setStatus("complete");
            }
        }
    }, [status, currentStep, scenario.steps.length]);

    return (
        <div className="w-full max-w-5xl mx-auto p-4">
            {/* Scenario Toggle */}
            <div className="flex justify-center mb-8">
                <div className="inline-flex bg-slate-100 dark:bg-white/5 backdrop-blur-md rounded-full p-1 border border-slate-200 dark:border-white/10">
                    {(Object.values(SCENARIOS) as Scenario[]).map((s) => (
                        <button
                            key={s.id}
                            onClick={() => setActiveScenario(s.id)}
                            className={`
                                relative flex items-center gap-2 px-6 py-3 rounded-full text-sm font-medium transition-all duration-300
                                ${activeScenario === s.id ? "text-slate-900 dark:text-white" : "text-slate-500 dark:text-gray-400 hover:text-slate-700 dark:hover:text-gray-200"}
                            `}
                        >
                            {activeScenario === s.id && (
                                <motion.div
                                    layoutId="activeTab"
                                    className="absolute inset-0 bg-slate-200 dark:bg-white/10 rounded-full shadow-sm"
                                    transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
                                />
                            )}
                            <s.icon className="w-4 h-4 relative z-10" />
                            <span className="relative z-10">{s.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Showcase Card */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 bg-white/80 dark:bg-[#0f1117]/80 backdrop-blur-xl border border-slate-200 dark:border-white/10 rounded-3xl overflow-hidden shadow-2xl ring-1 ring-slate-200 dark:ring-white/5">

                {/* LEFT: Input / Setup */}
                <div className="relative p-8 flex flex-col justify-between min-h-[400px] border-b lg:border-b-0 lg:border-r border-slate-200 dark:border-white/5 bg-gradient-to-br from-slate-50 dark:from-white/5 to-transparent">
                    <div>
                        <div className="flex items-center gap-3 mb-6">
                            <div className="p-2 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                                <scenario.icon className="w-5 h-5" />
                            </div>
                            <div>
                                <h3 className="text-lg font-semibold text-slate-900 dark:text-white">{scenario.label} Agent</h3>
                                <p className="text-sm text-slate-500 dark:text-gray-400">{scenario.description}</p>
                            </div>
                        </div>

                        {/* Mock Input Bubble */}
                        <div className="bg-slate-100 dark:bg-white/5 rounded-2xl p-4 border border-slate-200 dark:border-white/10 mb-6">
                            <div className="flex items-start gap-3">
                                <div className="w-8 h-8 rounded-full bg-purple-500/20 flex items-center justify-center mt-1">
                                    <span className="text-xs font-bold text-purple-700 dark:text-purple-400">YOU</span>
                                </div>
                                <div className="space-y-3 flex-1">
                                    <p className="text-sm text-slate-700 dark:text-gray-200">{scenario.userPrompt}</p>

                                    {/* Mock Attachment */}
                                    <div className="flex items-center gap-3 p-3 bg-slate-100 dark:bg-black/40 rounded-xl border border-slate-200 dark:border-white/5 group cursor-pointer hover:border-indigo-500/30 transition-colors">
                                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-slate-200 to-slate-300 dark:from-gray-800 dark:to-gray-900 flex items-center justify-center">
                                            <FileTextIcon className="text-slate-500 dark:text-gray-400" />
                                        </div>
                                        <div>
                                            <p className="text-xs font-medium text-slate-600 dark:text-gray-300">
                                                {activeScenario === 'medical' ? 'bill_scan_001.jpg' : 'quote_photo.jpg'}
                                            </p>
                                            <p className="text-[10px] text-slate-400 dark:text-gray-500">2.4 MB • Uploaded</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Action Button */}
                    <AnimatePresence mode="wait">
                        {status === "idle" ? (
                            <motion.div
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0, y: -10 }}
                            >
                                <Button
                                    onClick={startSimulation}
                                    className="w-full h-14 text-lg bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 shadow-lg shadow-indigo-500/20 dark:shadow-indigo-900/20 rounded-xl"
                                >
                                    <Sparkles className="w-5 h-5 mr-2 animate-pulse" />
                                    Run Agent Analysis
                                </Button>
                            </motion.div>
                        ) : (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                className="flex items-center justify-center gap-2 text-sm text-indigo-300 bg-indigo-500/10 py-3 rounded-xl border border-indigo-500/20"
                            >
                                <BrainCircuit className="w-4 h-4 animate-spin-slow" />
                                Agent is thinking...
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>

                {/* RIGHT: Agent Output */}
                <div className="relative p-8 bg-slate-50/50 dark:bg-black/20 flex flex-col justify-center min-h-[400px]">

                    {/* State: Thinking */}
                    {status === "thinking" && (
                        <div className="space-y-4">
                            {scenario.steps.map((step, idx) => (
                                <motion.div
                                    key={idx}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{
                                        opacity: idx === currentStep ? 1 : 0.4,
                                        x: 0,
                                        scale: idx === currentStep ? 1.02 : 1
                                    }}
                                    className={`flex items-center gap-3 ${idx > currentStep ? 'invisible' : ''}`}
                                >
                                    <div className={`
                                        w-6 h-6 rounded-full flex items-center justify-center border
                                        ${idx === currentStep
                                            ? 'border-indigo-500 text-indigo-400 animate-pulse bg-indigo-500/10'
                                            : 'border-green-500/30 text-green-500 bg-green-500/10'
                                        }
                                    `}>
                                        {idx === currentStep ? (
                                            <div className="w-2 h-2 rounded-full bg-indigo-500" />
                                        ) : (
                                            <CheckCircledIcon className="w-4 h-4" />
                                        )}
                                    </div>
                                    <span className={`text-sm ${idx === currentStep ? 'text-indigo-700 dark:text-indigo-200 font-medium' : 'text-slate-400 dark:text-gray-500'}`}>
                                        {step}
                                    </span>
                                </motion.div>
                            ))}
                        </div>
                    )}

                    {/* State: Complete */}
                    {status === "complete" && (
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ type: "spring", duration: 0.5 }}
                            className="bg-gradient-to-br from-green-500/10 to-emerald-500/5 border border-green-500/20 rounded-2xl p-6 relative overflow-hidden"
                        >
                            <div className="absolute top-0 right-0 p-4 opacity-10">
                                <LightningBoltIcon className="w-24 h-24 text-green-400" />
                            </div>

                            <div className="relative z-10">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <Badge variant="outline" className="border-green-500/30 text-green-400 bg-green-500/10 mb-2">
                                            Analysis Complete
                                        </Badge>
                                        <h4 className="text-xl font-bold text-slate-900 dark:text-white shadow-slate-200 dark:shadow-black drop-shadow-sm">
                                            {scenario.finalResult.title}
                                        </h4>
                                    </div>
                                    <div className="text-right">
                                        <p className="text-xs text-green-400 uppercase font-semibold tracking-wider">Estimated Savings</p>
                                        <p className="text-3xl font-bold text-green-400 tracking-tight">{scenario.finalResult.savings}</p>
                                    </div>
                                </div>

                                <div className="prose prose-invert prose-sm max-w-none mb-6 text-slate-600 dark:text-gray-300">
                                    <p className="leading-relaxed whitespace-pre-wrap">{scenario.finalResult.content}</p>
                                </div>

                                <div className="flex gap-3">
                                    <Link href="/dashboard" className="flex-1">
                                        <Button className="w-full bg-indigo-600 dark:bg-white text-white dark:text-black hover:bg-indigo-700 dark:hover:bg-gray-200 font-semibold group">
                                            <CopyIcon className="w-4 h-4 mr-2 group-hover:scale-110 transition-transform" />
                                            Copy & Use Script
                                        </Button>
                                    </Link>
                                    <Button
                                        variant="outline"
                                        onClick={() => { setStatus("idle"); setCurrentStep(0); }}
                                        className="border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-gray-400 hover:text-slate-900 dark:text-white"
                                    >
                                        <ReloadIcon className="w-4 h-4" />
                                    </Button>
                                </div>
                            </div>
                        </motion.div>
                    )}

                    {/* State: Idle / Placeholder */}
                    {status === "idle" && (
                        <div className="flex flex-col items-center justify-center text-center opacity-40">
                            <BrainCircuit className="w-16 h-16 text-indigo-500 mb-4" />
                            <p className="text-slate-600 dark:text-gray-300 font-medium">Ready to analyze</p>
                            <p className="text-sm text-slate-400 dark:text-gray-500">Agent is standing by...</p>
                        </div>
                    )}
                </div>
            </div>
            <div className="mt-4 text-center">
                <p className="text-xs text-slate-400 dark:text-gray-500">
                    * Simulation for demonstration purposes. Actual results may vary based on complexity.
                </p>
            </div>
        </div>
    );
};
