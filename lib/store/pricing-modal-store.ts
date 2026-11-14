"use client";
import { create } from 'zustand';

interface PricingModalState {
    isOpen: boolean;
    selectedTier: string | null;
    takeOpener: () => HTMLElement | null;
    open: (tier?: string | null, opener?: HTMLElement | null) => void;
    close: () => void;
}

export const usePricingModal = create<PricingModalState>((set) => {
    let trigger: HTMLElement | null = null;

    return {
        isOpen: false,
        selectedTier: null,
        takeOpener: () => {
            const opener = trigger;
            trigger = null;
            return opener;
        },
        open: (tier, opener) => {
            const focused = typeof document === 'undefined' ? null : document.activeElement;
            trigger = opener ?? (focused instanceof HTMLElement ? focused : null);
            set({ isOpen: true, selectedTier: tier ?? null });
        },
        close: () => set({ isOpen: false, selectedTier: null }),
    };
});
