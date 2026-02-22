import type { GraphQLResolveInfo, GraphQLSchema } from "graphql";

/**
 * Options for the built-in default key generator.
 */
export interface DefaultKeyGeneratorOptions {
  /**
   * Fallback identity label when no user/IP/api-key is available.
   * @default "anonymous"
   */
  anonymousIdentity?: string;

  /**
   * Whether API key sources are considered for identity extraction.
   * @default true
   */
  includeApiKey?: boolean;

  /**
   * Whether IP-based identity sources are considered.
   * @default true
   */
  includeIP?: boolean;

  /**
   * Whether user ID sources are considered for identity extraction.
   * @default true
   */
  includeUserId?: boolean;

  /**
   * Whether forwarded headers (x-forwarded-for) are trusted.
   * Only enable behind trusted proxies.
   * @default false
   */
  trustProxy?: boolean;
}

/**
 * Function to generate rate limit keys.
 * May return a promise for async identity resolution (e.g., DB lookups, JWT decoding).
 */
export type KeyGenerator<TContext = unknown> = (
  directiveArgs: RateLimitDirectiveArgs,
  source: unknown,
  args: Record<string, unknown>,
  context: TContext,
  info: GraphQLResolveInfo,
) => Promise<string> | string;

/**
 * Arguments for the @rateLimit directive in GraphQL schema.
 */
export interface RateLimitDirectiveArgs {
  /** Time window in seconds. */
  duration: number;

  /** Maximum number of requests allowed in the duration window. */
  limit: number;
}

/**
 * Configuration for the rate limit directive.
 */
export interface RateLimitDirectiveConfig<TContext = unknown> {
  /**
   * Options used when generating the built-in default key generator.
   * Ignored when a custom keyGenerator is provided.
   */
  defaultKeyGeneratorOptions?: DefaultKeyGeneratorOptions;

  /**
   * Custom key generator function.
   * Generates unique keys for rate limiting based on context.
   */
  keyGenerator?: KeyGenerator<TContext>;

  /**
   * Rate limiter class compatible with the expected consume() contract.
   */
  limiterClass: RateLimiterClass;

  /**
   * Options passed to the rate limiter constructor.
   */
  limiterOptions: RateLimiterOptions;

  /**
   * Runtime safety limits for validation bounds.
   */
  runtimeLimits?: RateLimitRuntimeLimits;

  /**
   * Behavior when the limiter backend is unavailable.
   * - failClosed: return service error (default, secure)
   * - failOpen: bypass rate limiting and execute resolver
   * @default "failClosed"
   */
  serviceErrorMode?: RateLimitServiceErrorMode;
}

/**
 * Constructor interface for a rate limiter implementation.
 */
export type RateLimiterClass = new (
  options: Record<string, unknown>,
) => RateLimiterInstance;

/**
 * Minimal interface required from a limiter instance.
 */
export interface RateLimiterInstance {
  consume(key: string): Promise<unknown>;
}

/**
 * Options for rate limiter configuration.
 */
export interface RateLimiterOptions {
  /** Redis client instance. */
  storeClient: unknown;
  [key: string]: unknown;
}

/**
 * Runtime limit overrides for validation bounds.
 */
export interface RateLimitRuntimeLimits {
  /** Maximum allowed directive duration in seconds. */
  maxDurationSeconds?: number;

  /** Maximum size for generated rate-limit keys. */
  maxKeyLength?: number;

  /** Maximum limiter instances (unique limit+duration pairs) per schema. */
  maxLimiterCacheSize?: number;

  /** Maximum allowed directive request limit. */
  maxLimit?: number;
}

/**
 * Defines behavior when rate-limiter backend operations fail.
 */
export type RateLimitServiceErrorMode = "failClosed" | "failOpen";

/**
 * Schema transformer function returned by createRateLimitDirective.
 * Applies rate limiting to fields decorated with the @rateLimit directive.
 */
export type SchemaTransformer = (schema: GraphQLSchema) => GraphQLSchema;
