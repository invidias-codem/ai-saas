"use client";
import { create } from 'zustand';

interface PricingModalState {
    isOpen: boolean;
    selectedTier: string | null;
    open: (tier?: string | null) => void;
    close: () => void;
}

export const usePricingModal = create<PricingModalState>((set) => ({
    isOpen: false,
    selectedTier: null,
    open: (tier) => set({ isOpen: true, selectedTier: tier ?? null }),
    close: () => set({ isOpen: false, selectedTier: null }),
}));
