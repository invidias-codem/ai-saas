"use client";

import React, { createContext, useContext, useSyncExternalStore } from "react";
import { CodeAgentMode } from "@/lib/llm/types";
import type { ProviderKeyState } from "@/lib/llm/codeModels";

interface CodeModelContextType {
    codeModel: string;
    setCodeModel: (mode: string) => void;
    providerKeyState: ProviderKeyState;
    setProviderKeyState: (state: ProviderKeyState) => void;
}

const CodeModelContext = createContext<CodeModelContextType | undefined>(undefined);

export function CodeModelProvider({ children }: { children: React.ReactNode }) {
    const listeners = React.useRef<Set<() => void>>(new Set());

    const subscribe = React.useCallback((onChange: () => void) => {
        listeners.current.add(onChange);
        return () => {
            listeners.current.delete(onChange);
        };
    }, []);

    const emit = () => {
        listeners.current.forEach((l) => l());
    };

    const [codeModelRaw, setCodeModelRaw] = React.useState<string>(() => {
        if (typeof window === 'undefined') return 'fast';
        const saved = localStorage.getItem('codeModel');
        return saved && ['fast', 'quality', 'agentic', 'reasoning', 'openrouter-llama-4', 'openrouter-qwen3-235b', 'openrouter-deepseek-r1'].includes(saved)
            ? saved
            : 'fast';
    });

    const [providerKeyState, setProviderKeyState] = React.useState<ProviderKeyState>({});

    const codeModel = useSyncExternalStore(
        subscribe,
        () => codeModelRaw,
        () => 'fast'
    );

    const setCodeModel = (mode: string) => {
        localStorage.setItem('codeModel', mode);
        setCodeModelRaw(mode);
        emit();
    };

    return (
        <CodeModelContext.Provider value={{ codeModel, setCodeModel, providerKeyState, setProviderKeyState }}>
            {children}
        </CodeModelContext.Provider>
    );
}

export function useCodeModel() {
    const context = useContext(CodeModelContext);
    if (context === undefined) {
        throw new Error('useCodeModel must be used within a CodeModelProvider');
    }
    return context;
}
