"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";

interface KoFiNudgeProps {
    isOpen: boolean;
    onClose: () => void;
}

export const KoFiNudge = ({ isOpen, onClose }: KoFiNudgeProps) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (isOpen) {
            // Begin enter transition when the modal opens.
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setIsVisible(true);
        } else {
            const timer = setTimeout(() => setIsVisible(false), 300); // Wait for transition
            return () => clearTimeout(timer);
        }
    }, [isOpen]);

    const t = useTranslations("KoFiNudge");

    if (!isVisible && !isOpen) return null;

    return (
        <div
            className={`
                fixed bottom-6 right-6 z-[100] transform transition-all duration-500 ease-in-out
                ${isOpen ? "translate-y-0 opacity-100" : "translate-y-10 opacity-0"}
            `}
        >
            <div className="relative group bg-white dark:bg-zinc-900 border border-amber-500/20 shadow-2xl rounded-2xl p-4 pr-12 max-w-sm flex items-center gap-4 animate-in slide-in-from-bottom-5 fade-in duration-500">
                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>

                {/* Ko-fi Icon/Image */}
                <div className="flex-shrink-0 w-12 h-12 bg-[#F5F5F5] rounded-full flex items-center justify-center overflow-hidden border">
                    <Image
                        src="https://storage.ko-fi.com/cdn/cup-border.png"
                        alt="Ko-fi"
                        width={32}
                        height={32}
                        className="object-contain animate-bounce"
                        style={{ animationDuration: '2s' }}
                    />
                </div>

                {/* Text & Action */}
                <div className="flex flex-col gap-1">
                    <p className="text-sm font-medium text-foreground">
                        {t('enjoyingGenie')}
                    </p>
                    <p className="text-xs text-muted-foreground mb-1">
                        {t('supportProject')}
                    </p>
                    <a
                        href={`https://ko-fi.com/${process.env.NEXT_PUBLIC_KOFI_PAGE || "joshuajair"}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center justify-center px-4 py-1.5 bg-[#FF5E5B] hover:bg-[#FF5E5B]/90 text-white text-xs font-bold rounded-full shadow-md hover:shadow-lg transition-all transform hover:scale-105"
                    >
                        <span>☕</span>
                        <span className="ml-1">{t('supportOnKoFi')}</span>
                    </a>
                </div>
            </div>
        </div>
    );
};
