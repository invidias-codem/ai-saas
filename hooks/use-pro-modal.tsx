"use client";
import { createContext, useContext, useState, ReactNode } from 'react';

interface ProModalStore {
    isOpen: boolean;
    onOpen: () => void;
    onClose: () => void;
}

const ProModalContext = createContext<ProModalStore | undefined>(undefined);

export const ProModalProvider = ({ children }: { children: ReactNode }) => {
    const [isOpen, setIsOpen] = useState(false);

    const onOpen = () => setIsOpen(true);
    const onClose = () => setIsOpen(false);

    return (
        <ProModalContext.Provider value={{ isOpen, onOpen, onClose }}>
            {children}
        </ProModalContext.Provider>
    );
};

export const useProModal = () => {
    const context = useContext(ProModalContext);
    if (context === undefined) {
        throw new Error('useProModal must be used within a ProModalProvider');
    }
    return context;
};
