"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface ParameterDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  children: React.ReactNode;
  title?: string;
}

/**
 * ParameterDrawer — bottom sheet on mobile, right sidebar on fold+ (600px+).
 * 
 * Uses conditional rendering to avoid the issue where translate-based hiding
 * can still show content. Solid background to prevent see-through.
 */
export function ParameterDrawer({
  open,
  onOpenChange,
  trigger,
  children,
  title = "Parameters",
}: ParameterDrawerProps) {
  // Close on Escape key
  React.useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onOpenChange]);

  return (
    <div className="relative">
      {trigger}

      {open && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
            onClick={() => onOpenChange(false)}
          />

          {/* Mobile: bottom sheet */}
          <div
            className="fixed bottom-0 left-0 right-0 z-50 md:hidden bg-background border-t border-border shadow-xl flex flex-col"
            style={{ maxHeight: "80vh" }}
          >
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

          {/* Desktop/Fold: right sidebar */}
          <div
            className="fixed right-0 top-0 bottom-0 z-50 hidden md:block max-w-sm w-full bg-background border-l border-border shadow-xl"
          >
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
      )}
    </div>
  );
}

/**
 * ParameterSection — labeled group within the drawer.
 */
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
