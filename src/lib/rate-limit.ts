/**
 * In-memory sliding-window rate limiter (best-effort on serverless — resets on cold start).
 * Use for abuse throttling on sensitive HTTP endpoints.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
  limit: number;
};

type Bucket = {
  /** timestamps of recent hits (ms) */
  hits: number[];
};

export class MemoryRateLimiter {
  private buckets = new Map<string, Bucket>();

  check(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
    const bucket = this.buckets.get(key) ?? { hits: [] };
    const cutoff = now - windowMs;
    bucket.hits = bucket.hits.filter((t) => t > cutoff);

    if (bucket.hits.length >= limit) {
      const oldest = bucket.hits[0] ?? now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
      this.buckets.set(key, bucket);
      return { allowed: false, remaining: 0, retryAfterSec, limit };
    }

    bucket.hits.push(now);
    this.buckets.set(key, bucket);
    return {
      allowed: true,
      remaining: Math.max(0, limit - bucket.hits.length),
      retryAfterSec: 0,
      limit,
    };
  }

  /** Peek without recording a hit. */
  peek(key: string, limit: number, windowMs: number, now = Date.now()): RateLimitResult {
    const bucket = this.buckets.get(key);
    if (!bucket) {
      return { allowed: true, remaining: limit, retryAfterSec: 0, limit };
    }
    const cutoff = now - windowMs;
    const hits = bucket.hits.filter((t) => t > cutoff);
    if (hits.length >= limit) {
      const oldest = hits[0] ?? now;
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec: Math.max(1, Math.ceil((oldest + windowMs - now) / 1000)),
        limit,
      };
    }
    return { allowed: true, remaining: limit - hits.length, retryAfterSec: 0, limit };
  }

  reset(key?: string) {
    if (key) this.buckets.delete(key);
    else this.buckets.clear();
  }
}

/** Shared process-wide limiter for API routes. */
export const apiRateLimiter = new MemoryRateLimiter();

export function clientIp(request: Request): string {
  const xf = request.headers.get("x-forwarded-for");
  if (xf) {
    const first = xf.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  const real = request.headers.get("x-real-ip")?.trim();
  if (real) return real.slice(0, 128);
  return "unknown";
}

export function rateLimitHeaders(result: RateLimitResult): HeadersInit {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    ...(result.allowed ? {} : { "Retry-After": String(result.retryAfterSec) }),
  };
}

export function tooManyRequests(result: RateLimitResult): Response {
  return Response.json(
    { ok: false, error: "Too many requests. Try again later." },
    { status: 429, headers: rateLimitHeaders(result) },
  );
}

/** Record a hit; return a 429 Response if over limit, else null. */
export function enforceRateLimit(
  key: string,
  limit: number,
  windowMs: number,
  limiter: MemoryRateLimiter = apiRateLimiter,
): Response | null {
  const result = limiter.check(key, limit, windowMs);
  if (!result.allowed) return tooManyRequests(result);
  return null;
}
