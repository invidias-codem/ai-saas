"use client";

import React, { createContext, useContext, useSyncExternalStore } from "react";
import { CodeAgentMode } from "@/lib/llm/types";

interface CodeModelContextType {
    codeModel: CodeAgentMode;
    setCodeModel: (mode: CodeAgentMode) => void;
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

    // codeModel is a client-only snapshot of localStorage; reading it during
    // render (via useSyncExternalStore) avoids a mount-time setState.
    const codeModel = useSyncExternalStore(
        subscribe,
        () => {
            const saved = localStorage.getItem("codeModel") as CodeAgentMode;
            return saved && ["fast", "quality", "agentic"].includes(saved)
                ? saved
                : "fast";
        },
        () => "fast" as CodeAgentMode
    );

    const setCodeModel = (mode: CodeAgentMode) => {
        localStorage.setItem("codeModel", mode);
        emit();
    };

    return (
        <CodeModelContext.Provider value={{ codeModel, setCodeModel }}>
            {children}
        </CodeModelContext.Provider>
    );
}

export function useCodeModel() {
    const context = useContext(CodeModelContext);
    if (context === undefined) {
        throw new Error("useCodeModel must be used within a CodeModelProvider");
    }
    return context;
}
