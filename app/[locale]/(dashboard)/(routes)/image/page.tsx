import { ImageContent } from "./content";
import { PaywallPage } from "@/components/explore/PaywallPage";

export default function ImagePage() {
    return (
        <PaywallPage featureName="Media Studio">
            <ImageContent />
        </PaywallPage>
    );
}
