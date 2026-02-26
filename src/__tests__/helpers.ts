import { makeExecutableSchema } from "@graphql-tools/schema";
import type { GraphQLResolveInfo, GraphQLSchema } from "graphql";
import { execute, parse } from "graphql";
import { vi } from "vitest";
import { createRateLimitDirective, rateLimitDirectiveTypeDefs } from "../directive.js";
import type { RateLimitDirectiveArgs, RateLimitDirectiveConfig } from "../types.js";

/**
 * Creates a mock Redis client with basic event and lifecycle stubs.
 */
export function createMockRedisClient() {
	return {
		on: vi.fn(),
		quit: vi.fn(),
	};
}

/**
 * Creates a mock limiter class that uses the provided consume spy.
 */
export function createMockLimiterClass(consumeSpy: ReturnType<typeof vi.fn>) {
	return class MockRateLimiterRedis {
		consume = consumeSpy;
	};
}

/**
 * Creates a mock limiter class that tracks how many instances are created.
 */
export function createCountingMockLimiterClass(consumeSpy: ReturnType<typeof vi.fn>) {
	let count = 0;

	const MockClass = class {
		consume = consumeSpy;
		constructor(_options: unknown) {
			count++;
		}
	};

	return {
		getCount: () => count,
		MockClass,
	};
}

interface BuildSchemaOptions {
	config: RateLimitDirectiveConfig;
	rateLimitDirective?: string;
	resolvers?: Record<string, Record<string, () => unknown>>;
	typeDefs?: string;
}

/**
 * Builds and transforms a GraphQL schema with the rate limit directive applied.
 */
export function buildRateLimitedSchema(options: BuildSchemaOptions) {
	const typeDefs =
		options.typeDefs ??
		`
    ${rateLimitDirectiveTypeDefs}
    type Query {
      test: String ${options.rateLimitDirective ?? "@rateLimit(limit: 5, duration: 60)"}
    }
  `;

	const resolvers = options.resolvers ?? {
		Query: { test: () => "success" },
	};

	const schema = makeExecutableSchema({ typeDefs, resolvers });
	const transformer = createRateLimitDirective(options.config);
	return transformer(schema);
}

/**
 * Executes a test GraphQL query against a schema.
 */
export async function executeTestQuery(
	schema: GraphQLSchema,
	query = "{ test }",
	contextValue?: unknown,
) {
	return execute({
		contextValue,
		document: parse(query),
		schema,
	});
}

/**
 * Standard mock directive arguments for testing.
 */
export const mockDirectiveArgs: RateLimitDirectiveArgs = {
	duration: 60,
	limit: 10,
};

/**
 * Standard mock GraphQLResolveInfo for testing.
 */
export const mockInfo = {
	fieldName: "test",
	parentType: {
		name: "Query",
	},
} as unknown as GraphQLResolveInfo;
