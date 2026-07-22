/**
 * Rate-limit simulation engine.
 *
 * Mirrors the directive.ts resolver wrapper logic:
 *   1. Generate key from identity
 *   2. Check Redis availability
 *   3. Consume from rate limiter
 *   4. Return result or error
 *
 * @module lib/simulation-engine
 */

import type {
  Identity,
  LimiterState,
  RateLimitConfig,
  SimulationResult,
} from "../types/rate-limit";

/** Identity-to-key-prefix map. */
const KEY_PREFIXES: Record<Identity, string> = {
  anonymous: "anonymous:anonymous",
  ip: "ip:192.168.1.1",
  user: "user:123",
};

/** Generates the rate-limit key from the current identity selection. */
export function generateKey(
  config: Pick<RateLimitConfig, "duration" | "identity" | "limit">,
): string {
  return `rateLimit:v2:${config.limit}:${config.duration}:${KEY_PREFIXES[config.identity]}:Query.login`;
}

/** Selects the counter/window state denoted by the generated Redis key. */
export function getOrCreateLimiterState(
  config: RateLimitConfig,
  statesByKey: Map<string, LimiterState>,
  redisDown: boolean,
): LimiterState {
  const key = generateKey(config);
  const existing = statesByKey.get(key);
  if (existing) {
    existing.redisDown = redisDown;
    return existing;
  }

  const created: LimiterState = {
    consumed: 0,
    redisDown,
    windowEnd: 0,
    windowStarted: false,
  };
  statesByKey.set(key, created);
  return created;
}

/**
 * Simulates a single GraphQL request through the rate-limiting pipeline.
 * Mutates `limiter` in place (consumed, windowEnd, windowStarted).
 */
export function simulateRequest(config: RateLimitConfig, limiter: LimiterState): SimulationResult {
  const key = generateKey(config);
  const now = Date.now();

  /* Check Redis availability first */
  if (limiter.redisDown) {
    if (config.serviceErrorMode === "failOpen") {
      return {
        key,
        response: { data: { login: "ok" } },
        status: "bypassed",
        statusCode: 200,
        timestamp: now,
      };
    }
    return {
      key,
      response: {
        errors: [
          {
            extensions: { code: "RATE_LIMIT_SERVICE_ERROR", http: { status: 503 } },
            message: "Rate limiting service unavailable",
          },
        ],
      },
      status: "service-error",
      statusCode: 503,
      timestamp: now,
    };
  }

  /* Initialize or reset window */
  if (!limiter.windowStarted || now >= limiter.windowEnd) {
    limiter.consumed = 0;
    limiter.windowEnd = now + config.duration * 1000;
    limiter.windowStarted = true;
  }

  /* Consume */
  limiter.consumed++;

  if (limiter.consumed > config.limit) {
    const msBeforeNext = limiter.windowEnd - now;
    const retryAfter = Math.max(1, Math.ceil(msBeforeNext / 1000));
    return {
      key,
      response: {
        errors: [
          {
            extensions: { code: "RATE_LIMITED", http: { status: 429 }, retryAfter },
            message: "Rate limit exceeded",
          },
        ],
      },
      retryAfter,
      status: "rejected",
      statusCode: 429,
      timestamp: now,
    };
  }

  return {
    key,
    response: { data: { login: "ok" } },
    status: "allowed",
    statusCode: 200,
    timestamp: now,
  };
}
