"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useSubscriptionStore } from '@/lib/store/subscription-store';
import { Sparkles, Lock } from 'lucide-react';
import { KoFiWidget } from '@/components/kofi-widget';

export function KofiDonationModal() {
    const { showKofiModal, setShowKofiModal, computeCredits } = useSubscriptionStore();

    return (
        <Dialog open={showKofiModal} onOpenChange={setShowKofiModal}>
            <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-slate-100 max-h-[90vh] overflow-y-auto p-4 sm:p-6">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-50">
                        {computeCredits <= 0 ? <Lock className="w-5 h-5 text-indigo-400" /> : <Sparkles className="w-5 h-5 text-indigo-400" />}
                        Unlock Premium Power Tools
                    </DialogTitle>
                    <DialogDescription className="text-slate-400 mt-2">
                        You&apos;ve used all your complimentary premium compute credits! You can continue using standard text chat for free, but advanced features like UCOL agentic execution, file ingestion, and code building are currently locked.
                    </DialogDescription>
                </DialogHeader>
                <div className="flex flex-col gap-4 py-4">
                    <div className="bg-slate-800 p-4 rounded-lg text-sm border border-slate-700">
                        <p className="font-medium text-slate-200 mb-2">Support the project to unlock:</p>
                        <ul className="space-y-2 text-slate-400 list-disc list-inside mb-4">
                            <li>Multi-agent UCOL processing</li>
                            <li>PDF & Document ingestion</li>
                            <li>Material takeoff generation</li>
                            <li>Priority generation queue</li>
                        </ul>
                        <div className="bg-indigo-900/30 border border-indigo-500/30 rounded p-3 text-xs text-indigo-200">
                            <strong>Crucial:</strong> Please ensure you use the exact email address associated with your account during the Ko-Fi checkout process to receive your credits instantly.
                        </div>
                    </div>
                </div>
                <div className="w-full mt-2">
                    <KoFiWidget />
                </div>
                <DialogFooter className="flex-col sm:flex-row gap-2">
                    <Button variant="outline" className="w-full bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-slate-100" onClick={() => setShowKofiModal(false)}>
                        Continue with Standard Chat
                    </Button>

                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
