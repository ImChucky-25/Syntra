/**
 * Simple in-memory fixed-window rate limiter.
 * Sufficient for the Phase 1 single-instance deployment; spec §5 defers
 * Redis-backed limiting to when we scale horizontally.
 */
import type { NextFunction, Request, Response } from 'express';
import { RateLimitError } from '../lib/errors.js';

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  const cutoff = now - 3_600_000;
  for (const [key, bucket] of buckets) {
    if (bucket.windowStart < cutoff) buckets.delete(key);
  }
  lastSweep = now;
}

export function rateLimit(opts: { windowMs: number; max: number; name: string }) {
  const { windowMs, max, name } = opts;
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown';
    const key = `${name}:${ip}`;
    const now = Date.now();
    sweep(now);

    const bucket = buckets.get(key);
    if (!bucket || now - bucket.windowStart >= windowMs) {
      buckets.set(key, { count: 1, windowStart: now });
      next();
      return;
    }
    bucket.count += 1;
    if (bucket.count > max) {
      next(new RateLimitError(`Rate limit exceeded for ${name}. Try again later.`));
      return;
    }
    next();
  };
}
