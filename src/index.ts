/**
 * GraphQL Rate Limit Redis — ESM Compatible
 *
 * A schema transformer that applies Redis-backed rate limiting to
 * fields decorated with the `@rateLimit` directive.
 *
 * @packageDocumentation
 */

// Exports are sorted by module path (biome's organizeImports rule), not by
// export name. This is enforced by the linter and is intentional.
export { ERROR_CODES } from "./constants.js";
export {
	createRateLimitDirective,
	rateLimitDirectiveTypeDefs,
} from "./directive.js";
export {
	createRateLimitedError,
	createRateLimitKeyError,
	createRateLimitServiceError,
	isRateLimitRejection,
	toRetryAfterSeconds,
} from "./errors.js";
export {
	createCompositeKeyGenerator,
	createDefaultKeyGenerator,
	createIPKeyGenerator,
	createUserKeyGenerator,
	defaultKeyGenerator,
	trustProxyGuidance,
} from "./key-generators.js";
export type {
	DefaultKeyGeneratorOptions,
	KeyGenerator,
	RateLimitDirectiveArgs,
	RateLimitDirectiveConfig,
	RateLimiterClass,
	RateLimiterInstance,
	RateLimiterOptions,
	RateLimitRuntimeLimits,
	RateLimitServiceErrorMode,
	SchemaTransformer,
} from "./types.js";
