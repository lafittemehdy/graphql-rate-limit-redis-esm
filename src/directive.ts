import { getDirective, MapperKind, mapSchema } from "@graphql-tools/utils";
import type { GraphQLFieldConfig, GraphQLResolveInfo, GraphQLSchema } from "graphql";
import { defaultFieldResolver } from "graphql";
import {
	createRateLimitedError,
	createRateLimitKeyError,
	createRateLimitServiceError,
	isRateLimitRejection,
} from "./errors.js";
import { createDefaultKeyGenerator } from "./key-generators.js";
import type {
	RateLimitDirectiveArgs,
	RateLimitDirectiveConfig,
	RateLimiterInstance,
	RateLimitRuntimeLimits,
	RateLimitServiceErrorMode,
	SchemaTransformer,
} from "./types.js";

const DIRECTIVE_NAME = "rateLimit";
const VALID_SERVICE_ERROR_MODES: readonly RateLimitServiceErrorMode[] = ["failClosed", "failOpen"];

/** Maximum allowed duration in seconds (1 year). */
const DEFAULT_MAX_DURATION_SECONDS = 31_536_000;

/** Maximum allowed request limit per window. */
const DEFAULT_MAX_LIMIT = 1_000_000;

/** Maximum length of a generated rate limit key. */
const DEFAULT_MAX_KEY_LENGTH = 512;

/** Maximum allowed number of limiter instances created per schema. */
const DEFAULT_MAX_LIMITER_CACHE_SIZE = 10_000;

interface ResolvedRuntimeLimits {
	maxDurationSeconds: number;
	maxKeyLength: number;
	maxLimiterCacheSize: number;
	maxLimit: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

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
function resolveRuntimeLimits(
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
function resolveServiceErrorMode(
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
function validateRequiredConfigFields<TContext = unknown>(
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

	if (
		typeof config.limiterOptions !== "object" ||
		config.limiterOptions === null ||
		Array.isArray(config.limiterOptions)
	) {
		throw new Error("Invalid rate limit configuration: limiterOptions must be an object.");
	}

	if (config.limiterOptions.storeClient == null) {
		throw new Error(
			"Invalid rate limit configuration: limiterOptions.storeClient is required and must not be null or undefined.",
		);
	}

	if (
		config.runtimeLimits !== undefined &&
		(typeof config.runtimeLimits !== "object" ||
			config.runtimeLimits === null ||
			Array.isArray(config.runtimeLimits))
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
function validateDirectiveArgs(
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
function parseDirectiveArgs(directive: unknown): RateLimitDirectiveArgs {
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

/**
 * Validates rate limit key generated by keyGenerator.
 */
function validateRateLimitKey(key: unknown, maxKeyLength: number): key is string {
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
 * Validates limiter instances created by limiterClass.
 */
function assertLimiterInstance(
	limiter: unknown,
	args: RateLimitDirectiveArgs,
): asserts limiter is RateLimiterInstance {
	if (!isRecord(limiter) || typeof limiter.consume !== "function") {
		throw new Error(
			`Invalid limiter class for @rateLimit(limit: ${args.limit}, duration: ${args.duration}): instances must expose a consume(key) method.`,
		);
	}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Creates a rate limit directive transformer for GraphQL schemas.
 *
 * Limiters are created at schema setup time (during `mapSchema`) and reused
 * across requests. Fields sharing the same `limit` and `duration` share a
 * single limiter instance.
 *
 * @param config - Rate limit directive configuration
 * @returns Schema transformer function
 *
 * @example
 * ```typescript
 * import { RateLimiterRedis } from "rate-limiter-flexible";
 *
 * const rateLimitTransformer = createRateLimitDirective({
 *   limiterClass: RateLimiterRedis,
 *   limiterOptions: { storeClient: redis },
 * });
 * const schema = rateLimitTransformer(baseSchema);
 * ```
 */
export function createRateLimitDirective<TContext = unknown>(
	config: RateLimitDirectiveConfig<TContext>,
): SchemaTransformer {
	validateRequiredConfigFields(config);

	const { limiterClass, limiterOptions } = config;
	const runtimeLimits = resolveRuntimeLimits(config.runtimeLimits);
	const serviceErrorMode = resolveServiceErrorMode(config.serviceErrorMode);
	const keyGenerator =
		config.keyGenerator ?? createDefaultKeyGenerator<TContext>(config.defaultKeyGeneratorOptions);

	/**
	 * Transforms a GraphQL schema by wrapping fields decorated with
	 * the @rateLimit directive in rate limiting logic.
	 *
	 * Limiter instances are created and cached here at setup time,
	 * not lazily on the first request.
	 */
	function rateLimitDirectiveTransformer(schema: GraphQLSchema): GraphQLSchema {
		const limitersByConfig = new Map<string, RateLimiterInstance>();

		return mapSchema(schema, {
			[MapperKind.OBJECT_FIELD]: (fieldConfig: GraphQLFieldConfig<unknown, TContext>) => {
				const directive = getDirective(schema, fieldConfig, DIRECTIVE_NAME)?.[0];

				if (!directive) {
					return fieldConfig;
				}

				const args = parseDirectiveArgs(directive);
				validateDirectiveArgs(args, runtimeLimits);

				// Create or reuse limiter at setup time
				const limiterKey = `${args.duration}:${args.limit}`;
				let limiter = limitersByConfig.get(limiterKey);
				if (!limiter) {
					if (limitersByConfig.size >= runtimeLimits.maxLimiterCacheSize) {
						throw new Error(
							`Limiter cache size exceeded (${runtimeLimits.maxLimiterCacheSize}). Reduce unique @rateLimit configurations or increase runtimeLimits.maxLimiterCacheSize.`,
						);
					}

					const createdLimiter = new limiterClass({
						...limiterOptions,
						duration: args.duration,
						points: args.limit,
					});
					assertLimiterInstance(createdLimiter, args);
					limiter = createdLimiter;
					limitersByConfig.set(limiterKey, limiter);
				}

				const { resolve = defaultFieldResolver } = fieldConfig;

				fieldConfig.resolve = async (
					source: unknown,
					resolverArgs: Record<string, unknown>,
					context: TContext,
					info: GraphQLResolveInfo,
				) => {
					const runResolver = () => resolve(source, resolverArgs, context, info);

					let key: string;
					try {
						key = await keyGenerator(args, source, resolverArgs, context, info);
					} catch {
						throw createRateLimitKeyError();
					}

					if (!validateRateLimitKey(key, runtimeLimits.maxKeyLength)) {
						throw createRateLimitKeyError();
					}

					try {
						await limiter.consume(key);
					} catch (error: unknown) {
						if (isRateLimitRejection(error)) {
							throw createRateLimitedError(error.msBeforeNext);
						}

						if (serviceErrorMode === "failOpen") {
							return runResolver();
						}

						throw createRateLimitServiceError();
					}

					return runResolver();
				};

				return fieldConfig;
			},
		});
	}

	return rateLimitDirectiveTransformer;
}

/**
 * SDL definition for the `@rateLimit` directive.
 *
 * Add this to your schema when using `createRateLimitDirective`.
 *
 * @example
 * ```ts
 * import { makeExecutableSchema } from "@graphql-tools/schema";
 * import { rateLimitDirectiveTypeDefs } from "graphql-rate-limit-redis-esm";
 *
 * const schema = makeExecutableSchema({
 *   typeDefs: [rateLimitDirectiveTypeDefs, yourTypeDefs],
 *   resolvers,
 * });
 * ```
 */
export const rateLimitDirectiveTypeDefs = /* GraphQL */ `directive @rateLimit(limit: Int!, duration: Int!) on FIELD_DEFINITION`;
