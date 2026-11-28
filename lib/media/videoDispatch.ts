import { tasks } from '@trigger.dev/sdk';
import { env } from '@/lib/env';
import { recordVideoDispatch, type VideoJob } from './videoStore';

export async function dispatchVideoCompletion(job: VideoJob): Promise<boolean> {
  if (job.trigger_run_id) return true;
  if (!env.TRIGGER_SECRET_KEY) return false;
  try {
    const handle = await tasks.trigger('video-completion', { jobId: job.id, userId: job.user_id }, {
      idempotencyKey: `video-completion:${job.id}`,
    });
    await recordVideoDispatch(job, handle.id);
    return true;
  } catch {
    console.warn('[VIDEO_COMPLETION_DISPATCH_FAILED]', job.id);
    return false; // Owner polling retries the same durable dispatch.
  }
}
