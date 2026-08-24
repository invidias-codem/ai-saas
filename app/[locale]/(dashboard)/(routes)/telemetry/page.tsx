import { TelemetryContent } from "./content";
import { PaywallPage } from "@/components/explore/PaywallPage";

export default function TelemetryPage() {
    return (
        <PaywallPage featureName="Sovereign Telemetry">
            <TelemetryContent />
        </PaywallPage>
    );
}
