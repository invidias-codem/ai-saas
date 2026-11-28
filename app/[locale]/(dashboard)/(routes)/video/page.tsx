import { VideoContent } from "./content";
import { PaywallPage } from "@/components/explore/PaywallPage";
import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import { getLatestVideoPrediction } from '@/lib/media/videoStore';

export default async function VideoPage() {
    const { userId } = await auth();
    if (!userId) redirect('/sign-in');
    const initialPrediction = await getLatestVideoPrediction(userId);
    return (
        <PaywallPage featureName="Media Studio">
            <VideoContent key={initialPrediction?.id ?? 'new'} initialPrediction={initialPrediction} />
        </PaywallPage>
    );
}
