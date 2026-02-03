"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export type AgentMode = "standard" | "agentic-preview";

interface ModelContextType {
    agentMode: AgentMode;
    setAgentMode: (mode: AgentMode) => void;
}

const ModelContext = createContext<ModelContextType | undefined>(undefined);

export function ModelProvider({ children }: { children: React.ReactNode }) {
    const [agentMode, setAgentModeState] = useState<AgentMode>("standard");

    useEffect(() => {
        // Load from localStorage on mount
        const saved = localStorage.getItem("agentMode") as AgentMode;
        if (saved === "standard" || saved === "agentic-preview") {
            setAgentModeState(saved);
        }
    }, []);

    const setAgentMode = (mode: AgentMode) => {
        setAgentModeState(mode);
        localStorage.setItem("agentMode", mode);
    };

    return (
        <ModelContext.Provider value={{ agentMode, setAgentMode }}>
            {children}
        </ModelContext.Provider>
    );
}

export function useModel() {
    const context = useContext(ModelContext);
    if (context === undefined) {
        throw new Error("useModel must be used within a ModelProvider");
    }
    return context;
}
