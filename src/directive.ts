import { getDirective, MapperKind, mapSchema } from "@graphql-tools/utils";
import type {
  GraphQLFieldConfig,
  GraphQLResolveInfo,
  GraphQLSchema,
} from "graphql";
import { GraphQLError } from "graphql";
import type { RateLimiterRedis } from "rate-limiter-flexible";
import {
  defaultKeyGenerator,
  type RateLimitDirectiveArgs,
  type RateLimitDirectiveConfig,
} from "./types.js";

const DIRECTIVE_NAME = "rateLimit";
const MAX_LIMITER_CACHE_SIZE = 100; // Prevent unbounded memory growth

/**
 * Validates rate limit directive arguments
 */
function validateDirectiveArgs(args: RateLimitDirectiveArgs): void {
  if (!Number.isInteger(args.limit) || args.limit <= 0) {
    throw new Error(
      `Invalid rate limit: ${args.limit}. Must be a positive integer.`,
    );
  }

  if (!Number.isInteger(args.duration) || args.duration <= 0) {
    throw new Error(
      `Invalid duration: ${args.duration}. Must be a positive integer (seconds).`,
    );
  }

  // Prevent abuse: duration should be reasonable (not more than 1 year)
  if (args.duration > 31536000) {
    throw new Error(
      `Invalid duration: ${args.duration}. Maximum allowed is 31536000 seconds (1 year).`,
    );
  }

  // Prevent abuse: limit should be reasonable
  if (args.limit > 1000000) {
    throw new Error(
      `Invalid limit: ${args.limit}. Maximum allowed is 1000000.`,
    );
  }
}

/**
 * Creates a rate limit directive transformer for GraphQL schemas
 */
export function createRateLimitDirective<TContext = any>(
  config: RateLimitDirectiveConfig<TContext>,
) {
  const {
    keyGenerator = defaultKeyGenerator,
    limiterClass,
    limiterOptions,
  } = config;

  // LRU cache of rate limiters per directive configuration
  // Using Map maintains insertion order for LRU eviction
  const limiterCache = new Map<string, RateLimiterRedis>();

  /**
   * Get or create a rate limiter for the given configuration
   * Implements LRU eviction to prevent unbounded memory growth
   */
  function getLimiter(args: RateLimitDirectiveArgs): RateLimiterRedis {
    // Validate arguments
    validateDirectiveArgs(args);

    const cacheKey = `${args.duration}:${args.limit}`;

    // Check if limiter exists (and move to end for LRU)
    if (limiterCache.has(cacheKey)) {
      const limiter = limiterCache.get(cacheKey)!;
      // Delete and re-add to move to end (most recently used)
      limiterCache.delete(cacheKey);
      limiterCache.set(cacheKey, limiter);
      return limiter;
    }

    // Evict oldest entry if cache is full (LRU)
    if (limiterCache.size >= MAX_LIMITER_CACHE_SIZE) {
      const oldestKey = limiterCache.keys().next().value;
      if (oldestKey) {
        limiterCache.delete(oldestKey);
      }
    }

    // Create new limiter
    const limiter = new limiterClass({
      duration: args.duration,
      points: args.limit,
      ...limiterOptions,
    });
    limiterCache.set(cacheKey, limiter);

    return limiter;
  }

  /**
   * Schema transformer function
   */
  function rateLimitDirectiveTransformer(schema: GraphQLSchema): GraphQLSchema {
    return mapSchema(schema, {
      [MapperKind.OBJECT_FIELD]: (
        fieldConfig: GraphQLFieldConfig<any, TContext>,
      ) => {
        const directive = getDirective(
          schema,
          fieldConfig,
          DIRECTIVE_NAME,
        )?.[0];

        if (!directive) {
          return fieldConfig;
        }

        const args = directive as RateLimitDirectiveArgs;
        const { resolve = defaultFieldResolver } = fieldConfig;

        // Wrap resolver with rate limiting
        fieldConfig.resolve = async (
          source: any,
          resolverArgs: Record<string, any>,
          context: TContext,
          info: GraphQLResolveInfo,
        ) => {
          try {
            const key = keyGenerator(args, source, resolverArgs, context, info);
            const limiter = getLimiter(args);

            try {
              await limiter.consume(key);
            } catch (rateLimitError: any) {
              // Check if it's a rate limit error (has msBeforeNext property)
              if (
                rateLimitError &&
                typeof rateLimitError.msBeforeNext === "number"
              ) {
                throw new GraphQLError("Rate limit exceeded", {
                  extensions: {
                    code: "RATE_LIMITED",
                    http: { status: 429 },
                    retryAfter: Math.ceil(rateLimitError.msBeforeNext / 1000),
                  },
                });
              }
              // Re-throw if it's not a rate limit error (e.g., Redis connection error)
              throw rateLimitError;
            }

            return resolve(source, resolverArgs, context, info);
          } catch (error: any) {
            // Handle Redis connection errors gracefully
            if (error.message?.includes("Redis")) {
              throw new GraphQLError("Rate limiting service unavailable", {
                extensions: {
                  code: "RATE_LIMIT_SERVICE_ERROR",
                  http: { status: 503 },
                },
              });
            }
            // Re-throw GraphQL errors and other errors
            throw error;
          }
        };

        return fieldConfig;
      },
    });
  }

  return rateLimitDirectiveTransformer;
}

/**
 * Default field resolver (same as GraphQL.js default)
 */
function defaultFieldResolver(
  source: any,
  _args: any,
  _contextValue: any,
  info: GraphQLResolveInfo,
) {
  if (typeof source === "object" && source !== null) {
    return source[info.fieldName];
  }
  return undefined;
}

/**
 * Type definitions for the rate limit directive
 */
export const rateLimitDirectiveTypeDefs = `
  directive @rateLimit(
    limit: Int!
    duration: Int!
  ) on FIELD_DEFINITION
`;
