import { Redis } from "@upstash/redis";
import { Ratelimit } from "@upstash/ratelimit";
import { shouldQuietBuildLogs } from '@/lib/runtime/buildPhase';

// In-memory fallback for development (when Upstash not configured)
class InMemoryRateLimiter {
  private requests: Map<string, number[]> = new Map();

  async limit(key: string, maxRequests: number, windowMs: number) {
    const now = Date.now();
    const requests = this.requests.get(key) || [];

    // Remove expired timestamps
    const validRequests = requests.filter(timestamp => now - timestamp < windowMs);

    const success = validRequests.length < maxRequests;

    if (success) {
      validRequests.push(now);
      this.requests.set(key, validRequests);
    }

    return {
      success,
      limit: maxRequests,
      remaining: Math.max(0, maxRequests - validRequests.length - (success ? 1 : 0)),
      reset: now + windowMs,
    };
  }

  // Cleanup old entries periodically
  cleanup() {
    const now = Date.now();
    for (const [key, timestamps] of this.requests.entries()) {
      const validTimestamps = timestamps.filter(t => now - t < 3600000); // 1 hour
      if (validTimestamps.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, validTimestamps);
      }
    }
  }
}

const inMemoryLimiter = new InMemoryRateLimiter();

// Cleanup every 5 minutes
if (typeof setInterval !== 'undefined') {
  setInterval(() => inMemoryLimiter.cleanup(), 5 * 60 * 1000);
}

// Check if Upstash is configured
const isUpstashConfigured =
  process.env.UPSTASH_REDIS_REST_URL &&
  process.env.UPSTASH_REDIS_REST_TOKEN;

let redis: Redis | null = null;
let anonymousLimiter: Ratelimit | null = null;
let authedLimiter: Ratelimit | null = null;
let aiLimiter: Ratelimit | null = null;
let queryLimiter: Ratelimit | null = null;
let mutationLimiter: Ratelimit | null = null;
let webhookLimiter: Ratelimit | null = null;
let perUserLimiter: Ratelimit | null = null;
let perIPLimiter: Ratelimit | null = null;

if (isUpstashConfigured) {
  console.log('[RATE_LIMIT] Upstash Redis configured - using distributed rate limiting');
  redis = Redis.fromEnv();

  // Anonymous: lower threshold
  anonymousLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, "10 m"),
    analytics: true,
  });

  // Authenticated: higher threshold
  authedLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, "10 m"),
    analytics: true,
  });

  // AI generation endpoints: strict limits (expensive operations)
  aiLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(20, "1 m"), // 20 per minute
    analytics: true,
  });

  // Query endpoints: moderate limits
  queryLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, "1 m"), // 100 per minute
    analytics: true,
  });

  // Mutation endpoints: moderate limits
  mutationLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(100, "1 m"), // 100 per minute
    analytics: true,
  });

  // Webhook endpoints: IP-based limits
  webhookLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(500, "1 h"), // 500 per hour
    analytics: true,
  });

  // Per-user global limit
  perUserLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(1000, "1 h"), // 1000 per hour
    analytics: true,
  });

  // Per-IP global limit
  perIPLimiter = new Ratelimit({
    redis,
    limiter: Ratelimit.slidingWindow(1000, "1 h"), // 1000 per hour
    analytics: true,
  });
} else {
  if (!shouldQuietBuildLogs()) {
    console.warn('[RATE_LIMIT] Upstash not configured - using in-memory fallback (not recommended for production)');
  }
}

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
  if (isUpstashConfigured && anonymousLimiter && authedLimiter) {
    const rl = isAuthed ? authedLimiter : anonymousLimiter;
    const res = await rl.limit(`feedback:${key}`);
    return {
      success: res.success,
      limit: res.limit,
      remaining: res.remaining,
      reset: res.reset,
    };
  }

  // Fallback to in-memory
  return inMemoryLimiter.limit(
    `feedback:${key}`,
    isAuthed ? 100 : 20,
    10 * 60 * 1000 // 10 minutes
  );
}

/**
 * Rate limit by endpoint type
 * 
 * @param userId - User ID (optional for webhooks)
 * @param ip - Client IP address
 * @param endpointType - Type of endpoint being accessed
 */
export async function limitApiEndpoint(
  userId: string | null,
  ip: string,
  endpointType: 'ai' | 'query' | 'mutation' | 'webhook'
): Promise<RateLimitResult> {
  // Select appropriate limiter
  let limiter: Ratelimit | null = null;
  let maxRequests = 100;
  let windowMs = 60 * 1000; // 1 minute

  switch (endpointType) {
    case 'ai':
      limiter = aiLimiter;
      maxRequests = 20;
      break;
    case 'query':
      limiter = queryLimiter;
      maxRequests = 100;
      break;
    case 'mutation':
      limiter = mutationLimiter;
      maxRequests = 100;
      break;
    case 'webhook':
      limiter = webhookLimiter;
      maxRequests = 500;
      windowMs = 60 * 60 * 1000; // 1 hour
      break;
  }

  const key = userId ? `${endpointType}:user:${userId}` : `${endpointType}:ip:${ip}`;

  if (isUpstashConfigured && limiter) {
    const res = await limiter.limit(key);
    return {
      success: res.success,
      limit: res.limit,
      remaining: res.remaining,
      reset: res.reset,
    };
  }

  // Fallback to in-memory
  return inMemoryLimiter.limit(key, maxRequests, windowMs);
}

/**
 * Global per-user rate limit (across all endpoints)
 * 1000 requests per hour per user
 */
export async function limitByUser(userId: string): Promise<RateLimitResult> {
  if (isUpstashConfigured && perUserLimiter) {
    const res = await perUserLimiter.limit(`global:user:${userId}`);
    return {
      success: res.success,
      limit: res.limit,
      remaining: res.remaining,
      reset: res.reset,
    };
  }

  // Fallback to in-memory
  return inMemoryLimiter.limit(`global:user:${userId}`, 1000, 60 * 60 * 1000);
}

/**
 * Global per-IP rate limit (across all endpoints)
 * 1000 requests per hour per IP
 */
export async function limitByIP(ip: string): Promise<RateLimitResult> {
  if (isUpstashConfigured && perIPLimiter) {
    const res = await perIPLimiter.limit(`global:ip:${ip}`);
    return {
      success: res.success,
      limit: res.limit,
      remaining: res.remaining,
      reset: res.reset,
    };
  }

  // Fallback to in-memory
  return inMemoryLimiter.limit(`global:ip:${ip}`, 1000, 60 * 60 * 1000);
}

/**
 * Rate limit error response
 */
export class RateLimitError extends Error {
  constructor(
    message: string = 'Too many requests',
    public retryAfter: number = 60
  ) {
    super(message);
    this.name = 'RateLimitError';
  }
}
