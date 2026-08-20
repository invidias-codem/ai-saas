"use client";

import { Activity } from "lucide-react";
import { useTranslations } from "next-intl";
import { Heading } from "@/components/heading";
import { Card } from "@/components/ui/card";
import { TelemetryServiceWorker } from "@/components/telemetry/TelemetryServiceWorker";
import { InteractionAuditViewer } from "@/components/telemetry/InteractionAuditViewer";

export default function TelemetryPage() {
  const t = useTranslations("Settings");
  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Registers the edge telemetry Service Worker (graceful if unavailable). */}
      <TelemetryServiceWorker />

      <Heading
        icon={Activity}
        title={t("telemetryTitle") || "Sovereign AI Telemetry"}
        description={
          t("telemetryDesc") ||
          "Local, sovereign audit ledger of AI interactions (UDIF 2.0). Captured at the edge, exportable to the enterprise tier."
        }
      />

      <Card className="p-4 sm:p-6 border-black/5">
        <InteractionAuditViewer />
      </Card>
    </div>
  );
}
