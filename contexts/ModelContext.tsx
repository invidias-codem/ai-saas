"use client";

import React, { createContext, useContext } from "react";
import { AgentMode } from "@/lib/llm/types";

interface ModelContextType {
    agentMode: AgentMode;
    setAgentMode: (mode: AgentMode) => void;
}

const ModelContext = createContext<ModelContextType | undefined>(undefined);

export function ModelProvider({ children }: { children: React.ReactNode }) {
    const agentMode: AgentMode = "quality";

    const setAgentMode = (_mode: AgentMode) => {
        // Intentionally no-op for now.
        // Pre-workspace chat uses one general mode; richer per-task/runtime shaping
        // should come from workspace operating profiles and UCOL routing instead.
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
