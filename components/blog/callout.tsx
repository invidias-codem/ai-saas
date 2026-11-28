"use client";

import { cn } from "@/lib/utils";
import { 
  Info, 
  AlertTriangle, 
  CheckCircle, 
  Lightbulb, 
  AlertCircle,
  Zap
} from "lucide-react";
import { ReactNode } from "react";

type CalloutType = "info" | "warning" | "success" | "tip" | "error" | "note";

interface CalloutProps {
  type?: CalloutType;
  title?: string;
  children: ReactNode;
}

const calloutConfig: Record<CalloutType, {
  icon: typeof Info;
  bgColor: string;
  borderColor: string;
  iconColor: string;
  titleColor: string;
}> = {
  info: {
    icon: Info,
    bgColor: "bg-accent",
    borderColor: "border-primary/30",
    iconColor: "text-accent-foreground",
    titleColor: "text-accent-foreground",
  },
  warning: {
    icon: AlertTriangle,
    bgColor: "bg-warning-surface",
    borderColor: "border-warning/30",
    iconColor: "text-warning",
    titleColor: "text-warning",
  },
  success: {
    icon: CheckCircle,
    bgColor: "bg-accent",
    borderColor: "border-primary/30",
    iconColor: "text-accent-foreground",
    titleColor: "text-accent-foreground",
  },
  tip: {
    icon: Lightbulb,
    bgColor: "bg-accent",
    borderColor: "border-primary/30",
    iconColor: "text-primary",
    titleColor: "text-accent-foreground",
  },
  error: {
    icon: AlertCircle,
    bgColor: "bg-danger-surface",
    borderColor: "border-destructive/30",
    iconColor: "text-destructive",
    titleColor: "text-destructive",
  },
  note: {
    icon: Zap,
    bgColor: "bg-chrome",
    borderColor: "border-border",
    iconColor: "text-muted-foreground",
    titleColor: "text-muted-foreground",
  },
};

export function Callout({ type = "info", title, children }: CalloutProps) {
  const config = calloutConfig[type];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "my-6 p-4 rounded-xl border",
        config.bgColor,
        config.borderColor
      )}
    >
      <div className="flex gap-3">
        <Icon className={cn("w-5 h-5 flex-shrink-0 mt-0.5", config.iconColor)} />
        <div className="flex-1 min-w-0">
          {title && (
            <p className={cn("font-semibold mb-1", config.titleColor)}>
              {title}
            </p>
          )}
          <div className="text-muted-foreground text-sm leading-relaxed [&>p]:mb-2 [&>p:last-child]:mb-0">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

export function InfoCallout({ title, children }: Omit<CalloutProps, "type">) {
  return <Callout type="info" title={title}>{children}</Callout>;
}

export function WarningCallout({ title, children }: Omit<CalloutProps, "type">) {
  return <Callout type="warning" title={title}>{children}</Callout>;
}

export function TipCallout({ title, children }: Omit<CalloutProps, "type">) {
  return <Callout type="tip" title={title}>{children}</Callout>;
}

export function SuccessCallout({ title, children }: Omit<CalloutProps, "type">) {
  return <Callout type="success" title={title}>{children}</Callout>;
}
