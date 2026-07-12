"use client";

import { Heading } from "@/components/heading";
import { Card } from "@/components/ui/card";
import { InteractionAuditViewer } from "@/components/telemetry/InteractionAuditViewer";
import { TelemetryServiceWorker } from "@/components/telemetry/TelemetryServiceWorker";
import { useTranslations } from "next-intl";

export default function TelemetryPage() {
  const t = useTranslations("Settings");
  return (
    <div className="space-y-6">
      {/* Registers the edge telemetry Service Worker (graceful if unavailable). */}
      <TelemetryServiceWorker />

      <Heading
        title={t("telemetryTitle") || "Sovereign AI Telemetry"}
        description={
          t("telemetryDesc") ||
          "Local, sovereign audit ledger of AI interactions (UDIF 2.0). Captured at the edge, exportable to the enterprise tier."
        }
      />

      <Card className="p-6 border-black/5">
        <InteractionAuditViewer />
      </Card>
    </div>
  );
}
