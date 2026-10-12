import { task, schedules, wait } from '@trigger.dev/sdk';
import { z } from 'zod';
import { getOwnedVideoJob, failVideoJob, listUndispatchedVideoJobs } from '@/lib/media/videoStore';
import { advanceVideoJob } from '@/lib/media/videoArtifact';
import { dispatchVideoCompletion } from '@/lib/media/videoDispatch';

const payloadSchema = z.object({ jobId: z.string().uuid(), userId: z.string().min(1) }).strict();

export const videoCompletionTask = task({
  id: 'video-completion',
  maxDuration: 3600,
  retry: { maxAttempts: 3, factor: 2, minTimeoutInMs: 1000, maxTimeoutInMs: 60_000 },
  run: async (input: z.infer<typeof payloadSchema>) => {
    const payload = payloadSchema.parse(input);
    for (;;) {
      const job = await getOwnedVideoJob(payload.userId, payload.jobId, 'id');
      if (!job) throw new Error('Video job not found');
      if (['succeeded', 'failed', 'canceled'].includes(job.status)) return { status: job.status };
      if (Date.now() - new Date(job.created_at).getTime() > 45 * 60_000) {
        await failVideoJob(job, 'Video completion timed out. Please try again.');
        return { status: 'failed' };
      }
      await advanceVideoJob(job);
      await wait.for({ seconds: 10 });
    }
  },
  onFailure: async ({ payload: input }) => {
    const payload = payloadSchema.parse(input);
    const job = await getOwnedVideoJob(payload.userId, payload.jobId, 'id');
    if (job) await failVideoJob(job, 'The video could not be completed and saved. Please try again.');
  },
});

// A persisted prediction is an outbox entry until dispatch is recorded. This
// repairs a failed dispatch even when the user has closed the page.
export const videoCompletionRecoveryTask = schedules.task({
  id: 'video-completion-recovery',
  cron: '*/2 * * * *',
  run: async () => {
    const jobs = await listUndispatchedVideoJobs();
    for (const job of jobs) await dispatchVideoCompletion(job);
    return { checked: jobs.length };
  },
});
