/**
 * Rate limiting for the public embed endpoints.
 *
 * These endpoints are open by necessity: the widget runs on any domain and
 * authenticates with a token that is visible in the page source of every site
 * that embeds it. Anyone who views source can replay it, and every replay
 * spends the project owner's tokens with their own provider key. A limit is
 * what stands between that and an unbounded bill.
 *
 * The counter lives in memory. That is a real limitation and worth stating:
 * with several application instances the effective limit is multiplied by the
 * instance count, and a restart forgets everything. It is chosen anyway because
 * the alternative is a Redis dependency in a project whose whole premise is
 * that you can run it on one VPS. A shared store belongs with the per-project
 * quota work, not here.
 */
import type { Request, Response, NextFunction } from "express";

export interface RateLimitOptions {
  /** Length of the window. */
  windowMs: number;
  /** Requests allowed per key within one window. */
  max: number;
  /** Distinguishes one caller from another. Defaults to the client IP. */
  keyOf?: (req: Request) => string;
}

interface Bucket {
  count: number;
  /** When the current window ends, as an epoch millisecond value. */
  resetAt: number;
}

/**
 * How often to drop expired buckets.
 *
 * Without this the map grows once per distinct IP forever, which on a public
 * endpoint is a slow memory leak rather than a cache.
 */
const SWEEP_INTERVAL_MS = 60_000;

export function createRateLimiter(options: RateLimitOptions) {
  const { windowMs, max, keyOf } = options;
  const buckets = new Map<string, Bucket>();

  const sweep = setInterval(() => {
    const now = Date.now();
    const expired: string[] = [];
    // Collected first rather than deleted inside the walk - mutating a Map
    // while iterating it is the kind of thing that works until it does not.
    buckets.forEach((bucket, key) => {
      if (bucket.resetAt <= now) expired.push(key);
    });
    expired.forEach((key) => buckets.delete(key));
  }, SWEEP_INTERVAL_MS);

  // Nothing should be kept alive by a housekeeping timer.
  sweep.unref?.();

  return function rateLimit(req: Request, res: Response, next: NextFunction) {
    // req.ip honours the X-Forwarded-For header only because `trust proxy` is
    // set; behind a proxy that does not send it, every caller shares one key.
    const key = keyOf ? keyOf(req) : req.ip || "unknown";
    const now = Date.now();

    let bucket = buckets.get(key);

    if (!bucket || bucket.resetAt <= now) {
      bucket = { count: 0, resetAt: now + windowMs };
      buckets.set(key, bucket);
    }

    bucket.count += 1;

    const remaining = Math.max(0, max - bucket.count);
    res.setHeader("RateLimit-Limit", String(max));
    res.setHeader("RateLimit-Remaining", String(remaining));
    res.setHeader("RateLimit-Reset", String(Math.ceil((bucket.resetAt - now) / 1000)));

    if (bucket.count > max) {
      res.setHeader("Retry-After", String(Math.ceil((bucket.resetAt - now) / 1000)));
      return res.status(429).json({
        message: "Too many messages in a short time. Please wait a moment and try again.",
      });
    }

    next();
  };
}

/**
 * The limit applied to the widget chat endpoints.
 *
 * Generous on purpose. A person having a conversation sends a message every few
 * seconds at most, so this is far above normal use and only bites on a script.
 */
export const embedChatRateLimit = createRateLimiter({
  windowMs: 60_000,
  max: Number(process.env.EMBED_RATE_LIMIT_PER_MINUTE) || 20,
});
