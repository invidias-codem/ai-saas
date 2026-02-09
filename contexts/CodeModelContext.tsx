"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { CodeAgentMode } from "@/lib/llm/types";

interface CodeModelContextType {
    codeModel: CodeAgentMode;
    setCodeModel: (mode: CodeAgentMode) => void;
}

const CodeModelContext = createContext<CodeModelContextType | undefined>(undefined);

export function CodeModelProvider({ children }: { children: React.ReactNode }) {
    const [codeModel, setCodeModelState] = useState<CodeAgentMode>("fast");

    useEffect(() => {
        const saved = localStorage.getItem("codeModel") as CodeAgentMode;
        if (saved && ["fast", "quality", "agentic"].includes(saved)) {
            setCodeModelState(saved);
        }
    }, []);

    const setCodeModel = (mode: CodeAgentMode) => {
        setCodeModelState(mode);
        localStorage.setItem("codeModel", mode);
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
