"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface StickyActionBarProps {
  children: React.ReactNode;
  className?: string;
  /** When true, the bar is visible. When false, hidden (for conditional display). */
  visible?: boolean;
}

/**
 * StickyActionBar — fixed bottom bar for mobile form actions.
 * 
 * Mobile (< 768px): Fixed to bottom, full width, backdrop blur.
 * Desktop (≥ 768px): Hidden (actions should be inline on desktop).
 */
export function StickyActionBar({
  children,
  className,
  visible = true,
}: StickyActionBarProps) {
  if (!visible) return null;

  return (
    <div
      className={cn(
        "fixed bottom-0 left-0 right-0 z-50 md:hidden",
        "bg-background/80 backdrop-blur-md border-t border-border",
        "p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        className
      )}
    >
      <div className="flex gap-2 max-w-lg mx-auto">{children}</div>
    </div>
  );
}

/**
 * FormSection — visual grouping for form fields on mobile.
 */
export function FormSection({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border/50 bg-background/50 p-4 space-y-3",
        className
      )}
    >
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      <div className="space-y-3">{children}</div>
    </div>
  );
}
