"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

import { AgentMode } from "@/lib/llm/types";

// Valid agent modes - keep in sync with AgentMode type in lib/llm/types.ts
const VALID_AGENT_MODES: AgentMode[] = ['fast', 'quality', 'agentic', 'reasoning'];

function isValidAgentMode(value: string): value is AgentMode {
    return VALID_AGENT_MODES.includes(value as AgentMode);
}

interface ModelContextType {
    agentMode: AgentMode;
    setAgentMode: (mode: AgentMode) => void;
}

const ModelContext = createContext<ModelContextType | undefined>(undefined);

export function ModelProvider({ children }: { children: React.ReactNode }) {
    const [agentMode, setAgentModeState] = useState<AgentMode>("fast");

    useEffect(() => {
        // Load from localStorage on mount
        const saved = localStorage.getItem("agentMode");
        if (saved && isValidAgentMode(saved)) {
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
