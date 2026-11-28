import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '@/lib/supabaseClient';
import type { ReplicatePrediction } from '@/components/media/types';

export const VIDEO_BUCKET = 'video-artifacts';
export interface VideoJob {
  id: string;
  user_id: string;
  prediction_id: string | null;
  trigger_run_id?: string | null;
  status: 'submitting' | 'starting' | 'processing' | 'persisting' | 'succeeded' | 'failed' | 'canceled';
  object_path: string | null;
  byte_size: number | null;
  error_message: string | null;
  created_at: string;
  input_hash?: string;
  lease_token?: string | null;
}

export function videoDb() {
  if (!supabaseAdmin) throw new Error('Video storage is not configured');
  return supabaseAdmin;
}

/** Browser contract contains stable application URLs only, never provider URLs. */
export function toVideoPrediction(job: VideoJob): ReplicatePrediction {
  const ready = job.status === 'succeeded' && !!job.object_path;
  return {
    id: job.prediction_id ?? job.id,
    status: ready ? 'succeeded' : job.status === 'failed' || job.status === 'canceled'
      ? job.status : job.status === 'starting' ? 'starting' : 'processing',
    output: ready ? `/api/video/artifacts/${job.id}/preview` : undefined,
    downloadUrl: ready ? `/api/video/artifacts/${job.id}/download` : undefined,
    error: job.error_message ? { detail: job.error_message } : undefined,
  };
}

export async function reserveVideoJob(userId: string, operationKey: string, inputHash: string) {
  const { data, error } = await videoDb().from('video_generation_jobs').upsert({
    id: randomUUID(), user_id: userId, operation_key: operationKey, input_hash: inputHash,
  }, { onConflict: 'user_id,operation_key', ignoreDuplicates: true }).select('*').maybeSingle();
  if (error) throw error;
  if (data) return { job: data as VideoJob, created: true };
  const { data: existing, error: readError } = await videoDb().from('video_generation_jobs')
    .select('*').eq('user_id', userId).eq('operation_key', operationKey).single();
  if (readError) throw readError;
  if (existing.input_hash !== inputHash) throw new Error('Video request key was already used for different input');
  return { job: existing as VideoJob, created: false };
}

export async function attachVideoPrediction(job: VideoJob, predictionId: string) {
  const { data, error } = await videoDb().from('video_generation_jobs')
    .update({ prediction_id: predictionId, status: 'starting', updated_at: new Date().toISOString() })
    .eq('id', job.id).eq('user_id', job.user_id).eq('status', 'submitting').select('*').maybeSingle();
  if (error) throw error;
  if (data) return data as VideoJob;
  // An acknowledged-lost write may already have attached the same prediction.
  const existing = await getOwnedVideoJob(job.user_id, job.id, 'id');
  if (existing?.prediction_id !== predictionId) throw new Error('Video prediction binding mismatch');
  return existing;
}

export async function recordVideoDispatch(job: VideoJob, runId: string) {
  const { error } = await videoDb().from('video_generation_jobs')
    .update({ trigger_run_id: runId, updated_at: new Date().toISOString() })
    .eq('id', job.id).eq('user_id', job.user_id).is('trigger_run_id', null);
  if (error) throw error;
}

/** Trusted scheduled worker reads this bounded outbox, then rechecks ownership. */
export async function listUndispatchedVideoJobs(): Promise<VideoJob[]> {
  const { data, error } = await videoDb().from('video_generation_jobs').select('*')
    .is('trigger_run_id', null).not('prediction_id', 'is', null)
    .in('status', ['starting', 'processing', 'persisting']).order('created_at').limit(100);
  if (error) throw error;
  return data as VideoJob[];
}

// Service-role reads ALWAYS carry the authenticated owner, even though RLS is bypassed.
export async function getOwnedVideoJob(userId: string, key: string, by: 'id' | 'prediction_id' = 'prediction_id') {
  const { data, error } = await videoDb().from('video_generation_jobs')
    .select('*').eq(by, key).eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data as VideoJob | null;
}

export async function getLatestVideoPrediction(userId: string): Promise<ReplicatePrediction | null> {
  const { data, error } = await videoDb().from('video_generation_jobs').select('*')
    .eq('user_id', userId).not('prediction_id', 'is', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ? toVideoPrediction(data as VideoJob) : null;
}

export async function failVideoJob(job: VideoJob, message: string, status: 'failed' | 'canceled' = 'failed') {
  const { error } = await videoDb().from('video_generation_jobs')
    .update({ status, error_message: message, updated_at: new Date().toISOString() })
    .eq('id', job.id).eq('user_id', job.user_id).not('status', 'in', '(succeeded,failed,canceled)');
  if (error) throw error;
}

/** Atomic lease prevents overlapping worker/poll retries from writing simultaneously. */
export async function claimVideoPersistence(job: VideoJob) {
  const now = new Date();
  const leaseToken = randomUUID();
  const { data, error } = await videoDb().from('video_generation_jobs').update({
    status: 'persisting', lease_token: leaseToken,
    lease_expires_at: new Date(now.getTime() + 300_000).toISOString(), updated_at: now.toISOString(),
  }).eq('id', job.id).eq('user_id', job.user_id).not('status', 'in', '(succeeded,failed,canceled)')
    .or(`lease_expires_at.is.null,lease_expires_at.lt.${now.toISOString()}`).select('id').maybeSingle();
  if (error) throw error;
  return data ? leaseToken : null;
}

export async function finishVideoPersistence(job: VideoJob, leaseToken: string, path: string, size: number) {
  const { error } = await videoDb().from('video_generation_jobs').update({
    status: 'succeeded', object_path: path, byte_size: size, error_message: null,
    lease_token: null, lease_expires_at: null, updated_at: new Date().toISOString(),
  }).eq('id', job.id).eq('user_id', job.user_id).eq('lease_token', leaseToken).eq('status', 'persisting');
  if (error) throw error;
}

export async function releaseVideoPersistence(job: VideoJob, leaseToken: string) {
  const { error } = await videoDb().from('video_generation_jobs').update({
    lease_token: null, lease_expires_at: null, updated_at: new Date().toISOString(),
  }).eq('id', job.id).eq('user_id', job.user_id).eq('lease_token', leaseToken).eq('status', 'persisting');
  if (error) throw error;
}
