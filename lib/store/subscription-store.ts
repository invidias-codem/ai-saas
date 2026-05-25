import { create } from 'zustand';

interface SubscriptionState {
    computeCredits: number;
    showKofiModal: boolean;
    setCredits: (credits: number) => void;
    setShowKofiModal: (show: boolean) => void;
    triggerPaywall: () => void;
}

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
    computeCredits: 200,
    showKofiModal: false,
    setCredits: (credits: number) => set({ computeCredits: credits }),
    setShowKofiModal: (show: boolean) => set({ showKofiModal: show }),
    triggerPaywall: () => set({ showKofiModal: true }),
}));
