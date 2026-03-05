import Redis from "ioredis";
import { RateLimiterRedis } from "rate-limiter-flexible";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { RateLimitDirectiveConfig } from "../types.js";
import { buildRateLimitedSchema, executeTestQuery } from "./helpers.js";

const redisUrl = process.env.REDIS_URL;
const describeRedis = redisUrl ? describe : describe.skip;

/** Generate a unique key prefix for test isolation. */
function uniquePrefix(): string {
	return `grl-test:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

describeRedis("Redis Integration", () => {
	let redis: Redis;
	let keyPrefix = "";

	beforeAll(async () => {
		redis = new Redis(redisUrl ?? "redis://localhost:6379");
		await redis.ping();
	});

	afterAll(async () => {
		await redis.quit();
	});

	afterEach(async () => {
		if (!keyPrefix) {
			return;
		}

		const keys = await redis.keys(`${keyPrefix}:*`);
		if (keys.length > 0) {
			await redis.del(keys);
		}

		keyPrefix = "";
	});

	it("should enforce rate limits using real Redis backend", async () => {
		keyPrefix = uniquePrefix();

		const config: RateLimitDirectiveConfig = {
			keyGenerator: () => "integration-user",
			limiterClass: RateLimiterRedis,
			limiterOptions: {
				keyPrefix,
				storeClient: redis,
			},
		};

		const schema = buildRateLimitedSchema({
			config,
			rateLimitDirective: "@rateLimit(limit: 2, duration: 60)",
			resolvers: { Query: { test: () => "ok" } },
		});

		const first = await executeTestQuery(schema);
		expect(first.errors).toBeUndefined();
		expect(first.data?.test).toBe("ok");

		const second = await executeTestQuery(schema);
		expect(second.errors).toBeUndefined();
		expect(second.data?.test).toBe("ok");

		const third = await executeTestQuery(schema);
		expect(third.errors).toBeDefined();
		expect(third.errors?.[0].extensions?.code).toBe("RATE_LIMITED");
		expect(third.errors?.[0].extensions?.http).toEqual({ status: 429 });
	});

	it("should isolate rate limits by key", async () => {
		keyPrefix = uniquePrefix();
		let currentUser = "user-a";

		const config: RateLimitDirectiveConfig = {
			keyGenerator: () => currentUser,
			limiterClass: RateLimiterRedis,
			limiterOptions: {
				keyPrefix,
				storeClient: redis,
			},
		};

		const schema = buildRateLimitedSchema({
			config,
			rateLimitDirective: "@rateLimit(limit: 1, duration: 60)",
			resolvers: { Query: { test: () => "ok" } },
		});

		// user-a: first request succeeds
		const a1 = await executeTestQuery(schema);
		expect(a1.errors).toBeUndefined();

		// user-a: second request blocked
		const a2 = await executeTestQuery(schema);
		expect(a2.errors).toBeDefined();
		expect(a2.errors?.[0].extensions?.code).toBe("RATE_LIMITED");

		// user-b: first request succeeds (separate quota)
		currentUser = "user-b";
		const b1 = await executeTestQuery(schema);
		expect(b1.errors).toBeUndefined();
	});

	it("should include retryAfter in rate limit error extensions", async () => {
		keyPrefix = uniquePrefix();

		const config: RateLimitDirectiveConfig = {
			keyGenerator: () => "retry-user",
			limiterClass: RateLimiterRedis,
			limiterOptions: {
				keyPrefix,
				storeClient: redis,
			},
		};

		const schema = buildRateLimitedSchema({
			config,
			rateLimitDirective: "@rateLimit(limit: 1, duration: 30)",
			resolvers: { Query: { test: () => "ok" } },
		});

		// Exhaust the limit
		await executeTestQuery(schema);

		// Verify retryAfter is present and reasonable
		const rejected = await executeTestQuery(schema);
		expect(rejected.errors).toBeDefined();

		const extensions = rejected.errors?.[0].extensions;
		expect(extensions?.code).toBe("RATE_LIMITED");
		expect(extensions?.retryAfter).toBeTypeOf("number");
		expect(extensions?.retryAfter).toBeGreaterThan(0);
		expect(extensions?.retryAfter).toBeLessThanOrEqual(30);
	});

	it("should reset limits after the sliding window expires", async () => {
		keyPrefix = uniquePrefix();

		const config: RateLimitDirectiveConfig = {
			keyGenerator: () => "window-user",
			limiterClass: RateLimiterRedis,
			limiterOptions: {
				keyPrefix,
				storeClient: redis,
			},
		};

		const schema = buildRateLimitedSchema({
			config,
			rateLimitDirective: "@rateLimit(limit: 1, duration: 2)",
			resolvers: { Query: { test: () => "ok" } },
		});

		// First request succeeds
		const first = await executeTestQuery(schema);
		expect(first.errors).toBeUndefined();

		// Second request blocked
		const second = await executeTestQuery(schema);
		expect(second.errors).toBeDefined();

		// Wait for the 2-second window to expire
		await new Promise((resolve) => setTimeout(resolve, 2500));

		// Third request succeeds (window reset)
		const third = await executeTestQuery(schema);
		expect(third.errors).toBeUndefined();
	});

	it("should handle concurrent requests correctly", async () => {
		keyPrefix = uniquePrefix();

		const config: RateLimitDirectiveConfig = {
			keyGenerator: () => "concurrent-user",
			limiterClass: RateLimiterRedis,
			limiterOptions: {
				keyPrefix,
				storeClient: redis,
			},
		};

		const schema = buildRateLimitedSchema({
			config,
			rateLimitDirective: "@rateLimit(limit: 3, duration: 60)",
			resolvers: { Query: { test: () => "ok" } },
		});

		// Fire 5 concurrent requests with a limit of 3
		const results = await Promise.all(Array.from({ length: 5 }, () => executeTestQuery(schema)));

		const allowed = results.filter((r) => !r.errors);
		const rejected = results.filter((r) => r.errors);

		expect(allowed).toHaveLength(3);
		expect(rejected).toHaveLength(2);

		for (const r of rejected) {
			expect(r.errors?.[0].extensions?.code).toBe("RATE_LIMITED");
		}
	});

	it("should apply different limits to different fields", async () => {
		keyPrefix = uniquePrefix();

		const config: RateLimitDirectiveConfig = {
			keyGenerator: (_args, _source, _resolverArgs, _context, info) =>
				`multi-field-user:${info.fieldName}`,
			limiterClass: RateLimiterRedis,
			limiterOptions: {
				keyPrefix,
				storeClient: redis,
			},
		};

		const schema = buildRateLimitedSchema({
			config,
			typeDefs: `
				directive @rateLimit(limit: Int!, duration: Int!) on FIELD_DEFINITION
				type Query {
					fast: String @rateLimit(limit: 1, duration: 60)
					slow: String @rateLimit(limit: 3, duration: 60)
				}
			`,
			resolvers: {
				Query: {
					fast: () => "fast-result",
					slow: () => "slow-result",
				},
			},
		});

		// fast: limit 1 — first succeeds, second blocked
		const fast1 = await executeTestQuery(schema, "{ fast }");
		expect(fast1.errors).toBeUndefined();
		expect(fast1.data?.fast).toBe("fast-result");

		const fast2 = await executeTestQuery(schema, "{ fast }");
		expect(fast2.errors).toBeDefined();

		// slow: limit 3 — all three succeed
		const slow1 = await executeTestQuery(schema, "{ slow }");
		expect(slow1.errors).toBeUndefined();

		const slow2 = await executeTestQuery(schema, "{ slow }");
		expect(slow2.errors).toBeUndefined();

		const slow3 = await executeTestQuery(schema, "{ slow }");
		expect(slow3.errors).toBeUndefined();

		// slow: fourth blocked
		const slow4 = await executeTestQuery(schema, "{ slow }");
		expect(slow4.errors).toBeDefined();
	});
});
