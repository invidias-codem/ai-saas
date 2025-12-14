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
    bgColor: "bg-blue-500/10",
    borderColor: "border-blue-500/30",
    iconColor: "text-blue-400",
    titleColor: "text-blue-300",
  },
  warning: {
    icon: AlertTriangle,
    bgColor: "bg-yellow-500/10",
    borderColor: "border-yellow-500/30",
    iconColor: "text-yellow-400",
    titleColor: "text-yellow-300",
  },
  success: {
    icon: CheckCircle,
    bgColor: "bg-green-500/10",
    borderColor: "border-green-500/30",
    iconColor: "text-green-400",
    titleColor: "text-green-300",
  },
  tip: {
    icon: Lightbulb,
    bgColor: "bg-purple-500/10",
    borderColor: "border-purple-500/30",
    iconColor: "text-purple-400",
    titleColor: "text-purple-300",
  },
  error: {
    icon: AlertCircle,
    bgColor: "bg-red-500/10",
    borderColor: "border-red-500/30",
    iconColor: "text-red-400",
    titleColor: "text-red-300",
  },
  note: {
    icon: Zap,
    bgColor: "bg-white/5",
    borderColor: "border-white/10",
    iconColor: "text-gray-400",
    titleColor: "text-gray-300",
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
          <div className="text-gray-300 text-sm leading-relaxed [&>p]:mb-2 [&>p:last-child]:mb-0">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// Quick variants for convenience
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
