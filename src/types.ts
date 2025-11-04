import type { GraphQLResolveInfo } from "graphql";
import type { RateLimiterRedis } from "rate-limiter-flexible";

/**
 * Configuration for the rate limit directive
 */
export interface RateLimitDirectiveConfig<TContext = any> {
  /**
   * Custom key generator function
   * Generates unique keys for rate limiting based on context
   */
  keyGenerator?: KeyGenerator<TContext>;

  /**
   * Rate limiter class (must be RateLimiterRedis)
   */
  limiterClass: typeof RateLimiterRedis;

  /**
   * Options passed to the rate limiter constructor
   */
  limiterOptions: RateLimiterOptions;
}

/**
 * Arguments for the @rateLimit directive in GraphQL schema
 */
export interface RateLimitDirectiveArgs {
  /**
   * Time window in seconds
   */
  duration: number;

  /**
   * Maximum number of requests allowed in the duration window
   */
  limit: number;
}

/**
 * Options for rate limiter configuration
 */
export interface RateLimiterOptions {
  /**
   * Redis client instance
   */
  storeClient: any;
}

/**
 * Function to generate rate limit keys
 */
export type KeyGenerator<TContext = any> = (
  directiveArgs: RateLimitDirectiveArgs,
  source: any,
  args: Record<string, any>,
  context: TContext,
  info: GraphQLResolveInfo,
) => string;

/**
 * Default key generator implementation
 * WARNING: This is NOT secure for per-user rate limiting!
 * Use createUserKeyGenerator or createIPKeyGenerator for production.
 */
export const defaultKeyGenerator: KeyGenerator = (
  _directiveArgs,
  _source,
  _args,
  _context,
  info,
) => {
  return `${info.parentType.name}.${info.fieldName}`;
};

/**
 * Creates a key generator that rate limits per user ID
 *
 * @param getUserId - Function to extract user ID from context
 * @returns KeyGenerator function
 *
 * @example
 * ```typescript
 * const keyGenerator = createUserKeyGenerator(
 *   (context) => context.user?.id || 'anonymous'
 * );
 * ```
 */
export function createUserKeyGenerator<TContext = any>(
  getUserId: (context: TContext) => string | null | undefined,
): KeyGenerator<TContext> {
  return (_directiveArgs, _source, _args, context, info) => {
    const userId = getUserId(context) || "anonymous";
    return `user:${userId}:${info.parentType.name}.${info.fieldName}`;
  };
}

/**
 * Creates a key generator that rate limits per IP address
 *
 * @param getIP - Function to extract IP address from context
 * @returns KeyGenerator function
 *
 * @example
 * ```typescript
 * const keyGenerator = createIPKeyGenerator(
 *   (context) => context.req?.ip || context.req?.headers['x-forwarded-for'] || 'unknown'
 * );
 * ```
 */
export function createIPKeyGenerator<TContext = any>(
  getIP: (context: TContext) => string | null | undefined,
): KeyGenerator<TContext> {
  return (_directiveArgs, _source, _args, context, info) => {
    const ip = getIP(context) || "unknown";
    return `ip:${ip}:${info.parentType.name}.${info.fieldName}`;
  };
}

/**
 * Creates a composite key generator that combines multiple identifiers
 *
 * @param getIdentifiers - Function to extract multiple identifiers from context
 * @returns KeyGenerator function
 *
 * @example
 * ```typescript
 * const keyGenerator = createCompositeKeyGenerator(
 *   (context) => ({
 *     userId: context.user?.id,
 *     apiKey: context.apiKey,
 *   })
 * );
 * ```
 */
export function createCompositeKeyGenerator<TContext = any>(
  getIdentifiers: (
    context: TContext,
  ) => Record<string, string | null | undefined>,
): KeyGenerator<TContext> {
  return (_directiveArgs, _source, _args, context, info) => {
    const identifiers = getIdentifiers(context);
    const identifierParts = Object.entries(identifiers)
      .filter(([_, value]) => value != null)
      .map(([key, value]) => `${key}:${value}`)
      .join(":");

    return `${identifierParts}:${info.parentType.name}.${info.fieldName}`;
  };
}
