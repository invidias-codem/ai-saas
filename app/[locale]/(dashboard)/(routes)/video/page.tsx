import { VideoContent } from "./content";
import { PaywallPage } from "@/components/explore/PaywallPage";

export default function VideoPage() {
    return (
        <PaywallPage featureName="Media Studio">
            <VideoContent />
        </PaywallPage>
    );
}
