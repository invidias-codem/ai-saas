"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ParameterDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  renderTrigger: (onToggle: () => void) => React.ReactNode;
  children: React.ReactNode;
  title?: string;
}

export function ParameterDrawer({
  open,
  onOpenChange,
  renderTrigger,
  children,
  title = "Parameters",
}: ParameterDrawerProps) {
  const toggle = React.useCallback(() => {
    onOpenChange(!open);
  }, [open, onOpenChange]);

  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => {
    // Intentionally set mounted state to avoid SSR hydration mismatch
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true);
  }, []);

  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  // Prevent body scroll when drawer is open
  React.useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const drawerContent = open ? (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        onClick={() => onOpenChange(false)}
      />

      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background border-t border-border shadow-xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between p-4 border-b border-border shrink-0">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            onClick={() => onOpenChange(false)}
            className="p-2 rounded-lg text-muted-foreground hover:bg-muted"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {children}
        </div>
      </div>
    </>
  ) : null;

  return (
    <>
      {renderTrigger(toggle)}
      {mounted && createPortal(drawerContent, document.body)}
    </>
  );
}

export function ParameterSection({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-3", className)}>
      <h3 className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
