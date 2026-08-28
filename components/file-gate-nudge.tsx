// components/file-gate-nudge.tsx
// Mobile-friendly nudge shown when file uploads are gated behind donation gate.
// Bottom sheet pattern (consistent with mobile design system).

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";

interface FileGateNudgeProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FileGateNudge = ({ isOpen, onClose }: FileGateNudgeProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const t = useTranslations("FileGateNudge");

  React.useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      // eslint-disable-next-line react-hooks/set-state-in-effect
    } else {
      const timer = setTimeout(() => setIsVisible(false), 300);
      return () => clearTimeout(timer);
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
  }, [isOpen]);

  if (!isVisible && !isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Bottom Sheet */}
      <div
        className={`relative w-full max-w-lg bg-white dark:bg-zinc-900 rounded-t-3xl border-t border-x border-amber-500/20 shadow-2xl transform transition-transform duration-300 ease-out ${
          isOpen ? "translate-y-0" : "translate-y-full"
        }`}
      >
        {/* Drag Handle */}
        <div className="flex justify-center pt-3">
          <div className="h-1.5 w-12 rounded-full bg-zinc-300 dark:bg-zinc-700" />
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-muted-foreground hover:text-foreground rounded-full hover:bg-muted transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Content */}
        <div className="p-6 space-y-4">
          {/* Ko-fi Icon */}
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-[#F5F5F5] rounded-full flex items-center justify-center overflow-hidden border-2 border-amber-500/20">
              <Image
                src="https://storage.ko-fi.com/cdn/cup-border.png"
                alt="Ko-fi"
                width={48}
                height={48}
                className="object-contain animate-bounce"
                style={{ animationDuration: "2s" }}
              />
            </div>
          </div>

          {/* Text */}
          <div className="text-center space-y-2">
            <h3 className="text-lg font-semibold text-foreground">
              {t("title")}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              {t("description")}
            </p>
          </div>

          {/* CTA */}
          <a
            href={`https://ko-fi.com/${process.env.NEXT_PUBLIC_KOFI_PAGE || "joshuajair"}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 bg-[#FF5E5B] hover:bg-[#FF5E5B]/90 text-white text-sm font-bold rounded-full shadow-md hover:shadow-lg transition-all transform hover:scale-[1.02] active:scale-[0.98]"
          >
            <span>☕</span>
            <span>{t("ctaLabel")}</span>
          </a>

          {/* Secondary Action */}
          <button
            onClick={onClose}
            className="w-full py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("dismissLabel")}
          </button>
        </div>
      </div>
    </div>
  );
};
