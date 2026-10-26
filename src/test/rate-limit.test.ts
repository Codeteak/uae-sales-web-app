import { describe, expect, it, beforeEach } from "vitest";
import { MemoryRateLimiter } from "@/lib/rate-limit";

describe("MemoryRateLimiter", () => {
  let limiter: MemoryRateLimiter;

  beforeEach(() => {
    limiter = new MemoryRateLimiter();
  });

  it("allows up to the limit then blocks", () => {
    const key = "t1";
    const windowMs = 60_000;
    expect(limiter.check(key, 2, windowMs).allowed).toBe(true);
    expect(limiter.check(key, 2, windowMs).allowed).toBe(true);
    const blocked = limiter.check(key, 2, windowMs);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
    expect(blocked.remaining).toBe(0);
  });

  it("resets after the window", () => {
    const key = "t2";
    const windowMs = 1_000;
    const t0 = 1_000_000;
    expect(limiter.check(key, 1, windowMs, t0).allowed).toBe(true);
    expect(limiter.check(key, 1, windowMs, t0 + 100).allowed).toBe(false);
    expect(limiter.check(key, 1, windowMs, t0 + 1_001).allowed).toBe(true);
  });

  it("peek does not consume quota", () => {
    const key = "t3";
    expect(limiter.peek(key, 1, 60_000).allowed).toBe(true);
    expect(limiter.peek(key, 1, 60_000).remaining).toBe(1);
    expect(limiter.check(key, 1, 60_000).allowed).toBe(true);
    expect(limiter.peek(key, 1, 60_000).allowed).toBe(false);
  });

  it("reset clears a key", () => {
    const key = "t4";
    expect(limiter.check(key, 1, 60_000).allowed).toBe(true);
    expect(limiter.check(key, 1, 60_000).allowed).toBe(false);
    limiter.reset(key);
    expect(limiter.check(key, 1, 60_000).allowed).toBe(true);
  });
});
