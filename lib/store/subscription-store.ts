"use client";
import { create } from 'zustand';
import { WELCOME_CREDITS } from '@/lib/subscription/packs';

interface SubscriptionState {
    computeCredits: number;
    showKofiModal: boolean;
    setCredits: (credits: number) => void;
    setShowKofiModal: (show: boolean) => void;
    triggerPaywall: () => void;
}

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
    computeCredits: WELCOME_CREDITS,
    showKofiModal: false,
    setCredits: (credits: number) => set({ computeCredits: credits }),
    setShowKofiModal: (show: boolean) => set({ showKofiModal: show }),
    triggerPaywall: () => set({ showKofiModal: true }),
}));
