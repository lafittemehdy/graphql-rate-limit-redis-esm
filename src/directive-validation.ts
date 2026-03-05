import type {
	RateLimitDirectiveArgs,
	RateLimitDirectiveConfig,
	RateLimiterInstance,
	RateLimitRuntimeLimits,
	RateLimitServiceErrorMode,
} from "./types.js";
import { isRecord } from "./utils.js";

const VALID_SERVICE_ERROR_MODES: readonly RateLimitServiceErrorMode[] = ["failClosed", "failOpen"];

/** Maximum allowed duration in seconds (1 year). */
const DEFAULT_MAX_DURATION_SECONDS = 31_536_000;

/** Maximum allowed request limit per window. */
const DEFAULT_MAX_LIMIT = 1_000_000;

/** Maximum length of a generated rate limit key. */
const DEFAULT_MAX_KEY_LENGTH = 512;

/** Maximum allowed number of limiter instances created per schema. */
const DEFAULT_MAX_LIMITER_CACHE_SIZE = 10_000;

export interface ResolvedRuntimeLimits {
	maxDurationSeconds: number;
	maxKeyLength: number;
	maxLimiterCacheSize: number;
	maxLimit: number;
}

/**
 * Validates an integer runtime limit value and returns a normalized value.
 */
function resolvePositiveIntegerLimit(
	value: number | undefined,
	defaultValue: number,
	fieldName: keyof RateLimitRuntimeLimits,
): number {
	const resolvedValue = value ?? defaultValue;

	if (!Number.isInteger(resolvedValue) || resolvedValue <= 0) {
		throw new Error(
			`Invalid runtime limit "${fieldName}": ${resolvedValue}. Must be a positive integer.`,
		);
	}

	return resolvedValue;
}

/**
 * Resolves and validates runtime limit overrides.
 */
export function resolveRuntimeLimits(
	runtimeLimits: RateLimitRuntimeLimits | undefined,
): ResolvedRuntimeLimits {
	return {
		maxDurationSeconds: resolvePositiveIntegerLimit(
			runtimeLimits?.maxDurationSeconds,
			DEFAULT_MAX_DURATION_SECONDS,
			"maxDurationSeconds",
		),
		maxKeyLength: resolvePositiveIntegerLimit(
			runtimeLimits?.maxKeyLength,
			DEFAULT_MAX_KEY_LENGTH,
			"maxKeyLength",
		),
		maxLimiterCacheSize: resolvePositiveIntegerLimit(
			runtimeLimits?.maxLimiterCacheSize,
			DEFAULT_MAX_LIMITER_CACHE_SIZE,
			"maxLimiterCacheSize",
		),
		maxLimit: resolvePositiveIntegerLimit(runtimeLimits?.maxLimit, DEFAULT_MAX_LIMIT, "maxLimit"),
	};
}

/**
 * Validates and normalizes service error handling mode.
 */
export function resolveServiceErrorMode(
	serviceErrorMode: RateLimitServiceErrorMode | undefined,
): RateLimitServiceErrorMode {
	switch (serviceErrorMode) {
		case undefined:
			return "failClosed";
		case "failClosed":
		case "failOpen":
			return serviceErrorMode;
		default: {
			const allowedModes = VALID_SERVICE_ERROR_MODES.join(", ");
			throw new Error(
				`Invalid serviceErrorMode: ${String(serviceErrorMode)}. Allowed values: ${allowedModes}.`,
			);
		}
	}
}

/**
 * Validates runtime-compatible input from JavaScript consumers.
 */
export function validateRequiredConfigFields<TContext = unknown>(
	config: RateLimitDirectiveConfig<TContext>,
): void {
	if (!isRecord(config) || Array.isArray(config)) {
		throw new Error("Invalid rate limit configuration: config must be an object.");
	}

	if (config.keyGenerator !== undefined && typeof config.keyGenerator !== "function") {
		throw new Error(
			"Invalid rate limit configuration: keyGenerator must be a function when provided.",
		);
	}

	if (typeof config.limiterClass !== "function") {
		throw new Error(
			"Invalid rate limit configuration: limiterClass must be a constructor function.",
		);
	}

	if (!isRecord(config.limiterOptions) || Array.isArray(config.limiterOptions)) {
		throw new Error("Invalid rate limit configuration: limiterOptions must be an object.");
	}

	if (config.limiterOptions.storeClient == null) {
		throw new Error(
			"Invalid rate limit configuration: limiterOptions.storeClient is required and must not be null or undefined.",
		);
	}

	if (
		config.runtimeLimits !== undefined &&
		(!isRecord(config.runtimeLimits) || Array.isArray(config.runtimeLimits))
	) {
		throw new Error(
			"Invalid rate limit configuration: runtimeLimits must be an object when provided.",
		);
	}
}

/**
 * Validates rate limit directive arguments at schema setup time.
 *
 * @param args - Directive arguments to validate
 * @param runtimeLimits - Runtime safety limits
 * @throws Error if arguments are out of bounds
 */
export function validateDirectiveArgs(
	args: RateLimitDirectiveArgs,
	runtimeLimits: ResolvedRuntimeLimits,
): void {
	if (!Number.isInteger(args.limit) || args.limit <= 0) {
		throw new Error(`Invalid rate limit: ${args.limit}. Must be a positive integer.`);
	}

	if (args.limit > runtimeLimits.maxLimit) {
		throw new Error(`Invalid limit: ${args.limit}. Maximum allowed is ${runtimeLimits.maxLimit}.`);
	}

	if (!Number.isInteger(args.duration) || args.duration <= 0) {
		throw new Error(`Invalid duration: ${args.duration}. Must be a positive integer (seconds).`);
	}

	if (args.duration > runtimeLimits.maxDurationSeconds) {
		throw new Error(
			`Invalid duration: ${args.duration}. Maximum allowed is ${runtimeLimits.maxDurationSeconds} seconds.`,
		);
	}
}

/**
 * Parses directive arguments from `getDirective()` output into a typed object.
 */
export function parseDirectiveArgs(directive: unknown): RateLimitDirectiveArgs {
	if (!isRecord(directive)) {
		throw new Error(
			"Invalid @rateLimit directive arguments: expected an object with numeric limit and duration.",
		);
	}

	const limit = directive.limit;
	const duration = directive.duration;

	if (typeof limit !== "number" || typeof duration !== "number") {
		throw new Error("Invalid @rateLimit directive arguments: limit and duration must be numbers.");
	}

	return { duration, limit };
}

/** Returns true when a string contains ASCII control characters. */
function containsControlCharacters(value: string): boolean {
	for (let i = 0; i < value.length; i++) {
		const codePoint = value.charCodeAt(i);
		if (codePoint <= 31 || codePoint === 127) {
			return true;
		}
	}
	return false;
}

/**
 * Validates rate limit key generated by keyGenerator.
 */
export function validateRateLimitKey(key: unknown, maxKeyLength: number): key is string {
	if (typeof key !== "string") {
		return false;
	}

	if (key.length === 0 || key.length > maxKeyLength) {
		return false;
	}

	// Disallow whitespace-only keys and accidental padding that creates
	// unexpected cache buckets.
	if (key.trim().length === 0 || key.trim() !== key) {
		return false;
	}

	// Reject control characters to prevent malformed Redis keys and log
	// injection when custom key generators are used.
	if (containsControlCharacters(key)) {
		return false;
	}

	return true;
}

/**
 * Validates limiter instances created by limiterClass.
 */
export function assertLimiterInstance(
	limiter: unknown,
	args: RateLimitDirectiveArgs,
): asserts limiter is RateLimiterInstance {
	if (!isRecord(limiter) || typeof limiter.consume !== "function") {
		throw new Error(
			`Invalid limiter class for @rateLimit(limit: ${args.limit}, duration: ${args.duration}): instances must expose a consume(key) method.`,
		);
	}
}
