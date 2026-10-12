import { auth } from '@clerk/nextjs/server';
import { getOwnedVideoJob, toVideoPrediction } from '@/lib/media/videoStore';
import { dispatchVideoCompletion } from '@/lib/media/videoDispatch';
import { limitVideoRead } from '@/lib/media/videoReadAuth';

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { userId } = await auth();
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const limited = await limitVideoRead(request, userId);
  if (limited) return limited;
  try {
    const { id } = await params;
    const job = await getOwnedVideoJob(userId, id);
    if (!job) return Response.json({ error: 'Video not found' }, { status: 404 });
    if (!['succeeded', 'failed', 'canceled'].includes(job.status)) {
      await dispatchVideoCompletion(job);
    }
    return Response.json(toVideoPrediction(job), {
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' },
    });
  } catch {
    console.error('[VIDEO_STATUS_READ_FAILED]');
    return Response.json({ error: 'Unable to read video status' }, { status: 503 });
  }
}
