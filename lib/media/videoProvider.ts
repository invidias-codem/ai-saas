import Replicate from 'replicate';
import { env } from '@/lib/env';

/** Submission, status, and the worker must use the SAME Replicate account. */
export function videoProvider() {
  const token = env.REPLICATE_API_TOKEN_VIDEO || env.REPLICATE_API_TOKEN;
  if (!token) throw new Error('Video generation provider is not configured');
  return new Replicate({ auth: token });
}
