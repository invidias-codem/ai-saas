"use client";

import { useSyncExternalStore } from "react";
import { ProModalProvider as ContextProvider } from "@/hooks/use-pro-modal";
import { PricingModal } from "@/components/modals/PricingModal";

export const ModalProvider = ({ children }: { children: React.ReactNode }) => {
    const isMounted = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false
    );

    return (
        <ContextProvider>
            {children}
            <PricingModal />
        </ContextProvider>
    );
};
