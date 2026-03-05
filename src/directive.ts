import { getDirective, MapperKind, mapSchema } from "@graphql-tools/utils";
import type { GraphQLFieldConfig, GraphQLResolveInfo, GraphQLSchema } from "graphql";
import { defaultFieldResolver } from "graphql";
import {
	assertLimiterInstance,
	parseDirectiveArgs,
	resolveRuntimeLimits,
	resolveServiceErrorMode,
	validateDirectiveArgs,
	validateRateLimitKey,
	validateRequiredConfigFields,
} from "./directive-validation.js";
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
	RateLimitServiceErrorMode,
	SchemaTransformer,
} from "./types.js";

const DIRECTIVE_NAME = "rateLimit";

type Resolver<TContext> = NonNullable<GraphQLFieldConfig<unknown, TContext>["resolve"]>;

/**
 * Builds a resolver wrapper that performs key generation and limiter checks
 * before delegating to the original field resolver.
 */
function createRateLimitedResolver<TContext>(
	resolver: Resolver<TContext>,
	options: {
		args: RateLimitDirectiveArgs;
		keyGenerator: NonNullable<RateLimitDirectiveConfig<TContext>["keyGenerator"]>;
		limiter: RateLimiterInstance;
		maxKeyLength: number;
		serviceErrorMode: RateLimitServiceErrorMode;
	},
): Resolver<TContext> {
	const { args, keyGenerator, limiter, maxKeyLength, serviceErrorMode } = options;

	return async (
		source: unknown,
		resolverArgs: Record<string, unknown>,
		context: TContext,
		info: GraphQLResolveInfo,
	) => {
		const runResolver = () => resolver(source, resolverArgs, context, info);

		let key: string;
		try {
			key = await keyGenerator(args, source, resolverArgs, context, info);
		} catch {
			throw createRateLimitKeyError();
		}

		if (!validateRateLimitKey(key, maxKeyLength)) {
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
}

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

				const baseResolver = (fieldConfig.resolve ?? defaultFieldResolver) as Resolver<TContext>;
				fieldConfig.resolve = createRateLimitedResolver(baseResolver, {
					args,
					keyGenerator,
					limiter,
					maxKeyLength: runtimeLimits.maxKeyLength,
					serviceErrorMode,
				});

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
