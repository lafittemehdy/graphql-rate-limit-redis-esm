import { GraphQLError } from "graphql";
import { ERROR_CODES } from "./constants.js";

const RATE_LIMITED_MESSAGE = "Rate limit exceeded";
const RATE_LIMIT_KEY_ERROR_MESSAGE = "Rate limiting key generation failed";
const RATE_LIMIT_SERVICE_ERROR_MESSAGE = "Rate limiting service unavailable";

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

/**
 * Checks whether an error is a rate limit rejection from rate-limiter-flexible.
 * Rate limit rejections have a numeric `msBeforeNext` property.
 */
export function isRateLimitRejection(error: unknown): error is { msBeforeNext: number } {
	if (!isRecord(error)) {
		return false;
	}

	const msBeforeNext = error.msBeforeNext;
	return typeof msBeforeNext === "number" && !Number.isNaN(msBeforeNext);
}

/**
 * Converts milliseconds-to-next into a safe Retry-After value (seconds).
 * Returns a minimum of 1 second for any non-positive or non-finite input.
 */
export function toRetryAfterSeconds(msBeforeNext: number): number {
	if (!Number.isFinite(msBeforeNext) || msBeforeNext <= 0) {
		return 1;
	}

	return Math.max(1, Math.ceil(msBeforeNext / 1000));
}

/**
 * Creates a standardized GraphQL error for rate-limit rejections.
 */
export function createRateLimitedError(msBeforeNext: number): GraphQLError {
	return new GraphQLError(RATE_LIMITED_MESSAGE, {
		extensions: {
			code: ERROR_CODES.RATE_LIMITED,
			http: { status: 429 },
			retryAfter: toRetryAfterSeconds(msBeforeNext),
		},
	});
}

/**
 * Creates a standardized GraphQL error for key generation failures.
 */
export function createRateLimitKeyError(): GraphQLError {
	return new GraphQLError(RATE_LIMIT_KEY_ERROR_MESSAGE, {
		extensions: {
			code: ERROR_CODES.RATE_LIMIT_KEY_ERROR,
			http: { status: 500 },
		},
	});
}

/**
 * Creates a standardized GraphQL error for backend limiter failures.
 */
export function createRateLimitServiceError(): GraphQLError {
	return new GraphQLError(RATE_LIMIT_SERVICE_ERROR_MESSAGE, {
		extensions: {
			code: ERROR_CODES.RATE_LIMIT_SERVICE_ERROR,
			http: { status: 503 },
		},
	});
}
