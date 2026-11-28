import { MusicContent } from "./content";
import { PaywallPage } from "@/components/explore/PaywallPage";

export default function MusicPage() {
    return (
        <PaywallPage featureName="Media Studio">
            <MusicContent />
        </PaywallPage>
    );
}
