import Redis from "ioredis";
import { RateLimiterRedis } from "rate-limiter-flexible";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { RateLimitDirectiveConfig } from "../types.js";
import { buildRateLimitedSchema, executeTestQuery } from "./helpers.js";

const redisUrl = process.env.REDIS_URL;
const describeRedis = redisUrl ? describe : describe.skip;

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
    keyPrefix = `graphql-rate-limit-redis-esm:test:${Date.now()}:${Math.random()
      .toString(16)
      .slice(2)}`;

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
});
