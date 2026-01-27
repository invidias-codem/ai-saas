"use client";

import { useState } from "react";
import { Zap } from "lucide-react";

interface SupportGenieProps {
    onSuccess?: () => void;
}

export const SupportGenie = ({ onSuccess }: SupportGenieProps) => {

    // Replace with your actual Ko-fi Page ID
    const KOFI_PAGE = "YourKofiName"; // User needs to update this

    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="text-center space-y-2 flex-none">
                <h2 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-pink-500 via-red-500 to-yellow-500">
                    Support Genie
                </h2>
                <p className="text-muted-foreground text-sm">
                    Unlock automated credits by supporting the project on Ko-fi.
                </p>
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-3 text-xs text-amber-600 dark:text-amber-400 font-medium">
                    ⚠️ Important: Use the same email address on Ko-fi as your Genie account so we can automatically credit you!
                </div>
            </div>

            {/* Donation Card */}
            <div className="flex-1 flex flex-col items-center justify-center bg-muted/50 rounded-xl p-8 border border-dashed">
                <div className="p-4 bg-white dark:bg-zinc-900 rounded-full mb-4 shadow-sm">
                    <Zap className="w-12 h-12 text-yellow-500 fill-yellow-500" />
                </div>
                <h3 className="text-xl font-bold mb-2">Buy me a coffee</h3>
                <p className="text-center text-muted-foreground mb-6 max-w-xs">
                    Your support directly funds the GPU servers running this agent.
                </p>

                <a
                    href={`https://ko-fi.com/${KOFI_PAGE}`}
                    target="_blank"
                    rel="noreferrer"
                    className="w-full max-w-sm"
                >
                    <button className="w-full bg-[#FF5E5B] hover:bg-[#FF5E5B]/90 text-white font-bold py-3 px-6 rounded-full transition-all transform hover:scale-105 shadow-lg flex items-center justify-center gap-2">
                        <span>☕</span> Support on Ko-fi
                    </button>
                </a>
            </div>

            {/* Manual Fallback */}
            <div className="text-center pt-2 border-t text-xs text-muted-foreground flex-none">
                <p>Donated with a different email? <a href="mailto:support@genie.com?subject=Claim Credits" className="underline hover:text-primary">Contact Support</a> to claim your credits.</p>
            </div>
        </div>
    );
};
