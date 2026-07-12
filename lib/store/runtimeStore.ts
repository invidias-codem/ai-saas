"use client";

import { create } from "zustand";

export interface RuntimeStateSnapshot {
  agentMode: string | undefined;
  executionMode: string | undefined;
  intent: string | undefined;
  loading: boolean;
  streaming: boolean;
  error: string | null;
  pendingApproval: boolean;
  approvalAction: { type: string; repo: string; target?: string } | null;
}

interface RuntimeActions {
  setRuntime: (partial: Partial<RuntimeStateSnapshot>) => void;
  setPendingApproval: (action: { type: string; repo: string; target?: string } | null) => void;
  clearPendingApproval: () => void;
  reset: () => void;
}

const initialState: RuntimeStateSnapshot = {
  agentMode: undefined,
  executionMode: undefined,
  intent: undefined,
  loading: false,
  streaming: false,
  error: null,
  pendingApproval: false,
  approvalAction: null,
};

export const useRuntimeStore = create<RuntimeStateSnapshot & RuntimeActions>((set) => ({
  ...initialState,
  setRuntime: (partial) => set((prev) => ({ ...prev, ...partial })),
  setPendingApproval: (action) =>
    set(() => ({
      pendingApproval: Boolean(action),
      approvalAction: action,
    })),
  clearPendingApproval: () =>
    set(() => ({
      pendingApproval: false,
      approvalAction: null,
    })),
  reset: () => set(initialState),
}));
