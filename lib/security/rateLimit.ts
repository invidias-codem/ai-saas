import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";

const redis = Redis.fromEnv();

// Anonymous: lower threshold
const anonymousLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(20, "10 m"),
  analytics: true,
});

// Authenticated: higher threshold
const authedLimiter = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(100, "10 m"),
  analytics: true,
});

export type RateLimitResult = {
  success: boolean;
  limit: number;
  remaining: number;
  reset: number;
};

/**
 * Distributed rate limiting for feedback ingestion.
 *
 * Keying is handled by the caller; we only prefix with `feedback:`.
 */
export async function limitFeedback(
  key: string,
  isAuthed: boolean
): Promise<RateLimitResult> {
  const rl = isAuthed ? authedLimiter : anonymousLimiter;
  const res = await rl.limit(`feedback:${key}`);

  return {
    success: res.success,
    limit: res.limit,
    remaining: res.remaining,
    reset: res.reset,
  };
}
