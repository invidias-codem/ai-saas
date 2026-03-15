"use client";

import { useEffect, useState } from "react";
import { ProModal } from "@/components/pro-modal";
import { ProModalProvider as ContextProvider } from "@/hooks/use-pro-modal";

export const ModalProvider = ({ children }: { children: React.ReactNode }) => {
    const [isMounted, setIsMounted] = useState(false);

    useEffect(() => {
        setIsMounted(true);
    }, []);

    // We render children wrapped in ContextProvider ALWAYS to ensure Context is available.
    // However, ProModal component itself prevents hydration mismatch by relying on Dialog internal state or we can conditionally render it.
    // UseStandard Pattern:

    if (!isMounted) {
        // Return children without modal on server/first render to avoid mismatch, 
        // BUT providing context is safe? 
        // No, if useProModal is called in children, it needs context.
        // So satisfy context.
        return (
            <ContextProvider>
                {children}
            </ContextProvider>
        );
    }

    return (
        <ContextProvider>
            {children}
            <ProModal />
        </ContextProvider>
    );
};
