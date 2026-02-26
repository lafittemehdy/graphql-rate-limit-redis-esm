/**
 * Domain types for the rate-limit visualization.
 *
 * @module types/rate-limit
 */

/** Error mode when Redis is unavailable. */
export type ErrorMode = "failClosed" | "failOpen";

/** Identity strategy for key generation. */
export type Identity = "anonymous" | "ip" | "user";

/** Rate limit configuration. */
export interface RateLimitConfig {
  duration: number;
  identity: Identity;
  limit: number;
  serviceErrorMode: ErrorMode;
}

/** Mutable limiter window state. */
export interface LimiterState {
  consumed: number;
  redisDown: boolean;
  windowEnd: number;
  windowStarted: boolean;
}

/** Possible result statuses for a simulated request. */
export type RequestStatus = "allowed" | "bypassed" | "rejected" | "service-error";

/** Result of a single simulated request. */
export interface SimulationResult {
  key: string;
  response: Record<string, unknown>;
  retryAfter?: number;
  status: RequestStatus;
  statusCode: number;
  timestamp: number;
}

/** Scenario identifiers for preset automation. */
export type ScenarioId = "burst" | "normal" | "outage" | "reset";
