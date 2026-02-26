/**
 * GraphQL error extension codes used by the rate limit directive.
 *
 * @example
 * ```typescript
 * if (error.extensions?.code === ERROR_CODES.RATE_LIMITED) {
 *   // handle rate limit rejection
 * }
 * ```
 */
export const ERROR_CODES = Object.freeze({
	RATE_LIMITED: "RATE_LIMITED",
	RATE_LIMIT_KEY_ERROR: "RATE_LIMIT_KEY_ERROR",
	RATE_LIMIT_SERVICE_ERROR: "RATE_LIMIT_SERVICE_ERROR",
} as const);
