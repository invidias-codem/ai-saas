"use client";
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { v4 as uuidv4 } from 'uuid';

export interface Message {
  role: 'user' | 'bot';
  text: string;
}

interface GuestChatState {
  guestSessionId: string | null;
  messages: Message[];
  interactionCount: number;
  limitReached: boolean;
  addMessage: (message: Message) => void;
  incrementInteraction: () => void;
  setLimitReached: (reached: boolean) => void;
  clearSession: () => void;
}

export const useGuestChatStore = create<GuestChatState>()(
  persist(
    (set, get) => ({
      guestSessionId: null,
      messages: [],
      interactionCount: 0,
      limitReached: false,

      addMessage: (message) => set((state) => {
        // Initialize session ID on first message if not present
        const sessionId = state.guestSessionId || uuidv4();
        return {
          guestSessionId: sessionId,
          messages: [...state.messages, message]
        };
      }),

      incrementInteraction: () => set((state) => {
        const newCount = state.interactionCount + 1;
        return {
          interactionCount: newCount,
          limitReached: newCount >= 10
        };
      }),

      setLimitReached: (reached) => set({ limitReached: reached }),

      clearSession: () => set({
        guestSessionId: null,
        messages: [],
        interactionCount: 0,
        limitReached: false
      })
    }),
    {
      name: 'genie-guest-chat',
    }
  )
);
