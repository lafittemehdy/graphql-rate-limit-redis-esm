import { makeExecutableSchema } from "@graphql-tools/schema";
import { GraphQLError } from "graphql";
import { RateLimiterRedis } from "rate-limiter-flexible";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRateLimitDirective,
  rateLimitDirectiveTypeDefs,
} from "../directive.js";
import type { RateLimitDirectiveConfig } from "../types.js";
import {
  buildRateLimitedSchema,
  createCountingMockLimiterClass,
  createMockLimiterClass,
  createMockRedisClient,
  executeTestQuery,
} from "./helpers.js";

describe("RateLimitDirective", () => {
  let mockRedisClient: ReturnType<typeof createMockRedisClient>;
  let consumeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockRedisClient = createMockRedisClient();
    consumeSpy = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Input Validation", () => {
    it.each([
      {
        expectedMessage: "Invalid rate limit",
        name: "negative limit",
        rateLimitDirective: "@rateLimit(limit: -1, duration: 60)",
      },
      {
        expectedMessage: "Invalid rate limit",
        name: "zero limit",
        rateLimitDirective: "@rateLimit(limit: 0, duration: 60)",
      },
      {
        expectedMessage: "Invalid duration",
        name: "negative duration",
        rateLimitDirective: "@rateLimit(limit: 10, duration: -1)",
      },
      {
        expectedMessage: "Maximum allowed is 31536000",
        name: "duration exceeding 1 year",
        rateLimitDirective: "@rateLimit(limit: 10, duration: 31536001)",
      },
      {
        expectedMessage: "Maximum allowed is 1000000",
        name: "limit exceeding 1 million",
        rateLimitDirective: "@rateLimit(limit: 1000001, duration: 60)",
      },
    ])("should reject invalid directive values: $name", ({
      expectedMessage,
      rateLimitDirective,
    }) => {
      const config: RateLimitDirectiveConfig = {
        limiterClass: RateLimiterRedis,
        limiterOptions: { storeClient: mockRedisClient },
      };

      const typeDefs = `
          ${rateLimitDirectiveTypeDefs}
          type Query {
            test: String ${rateLimitDirective}
          }
        `;

      const schema = makeExecutableSchema({
        resolvers: { Query: { test: () => "success" } },
        typeDefs,
      });

      const rateLimitTransformer = createRateLimitDirective(config);
      expect(() => rateLimitTransformer(schema)).toThrow(expectedMessage);
    });

    it("should accept valid limit and duration", async () => {
      consumeSpy.mockResolvedValue(undefined);

      const schema = buildRateLimitedSchema({
        config: {
          limiterClass: createMockLimiterClass(consumeSpy),
          limiterOptions: { storeClient: mockRedisClient },
        },
        rateLimitDirective: "@rateLimit(limit: 10, duration: 60)",
      });

      const result = await executeTestQuery(schema);

      expect(result.errors).toBeUndefined();
      expect(result.data?.test).toBe("success");
      expect(consumeSpy).toHaveBeenCalledTimes(1);
    });

    it("should honor runtime limit overrides", () => {
      const config: RateLimitDirectiveConfig = {
        limiterClass: RateLimiterRedis,
        limiterOptions: { storeClient: mockRedisClient },
        runtimeLimits: { maxLimit: 10 },
      };

      const typeDefs = `
        ${rateLimitDirectiveTypeDefs}
        type Query {
          test: String @rateLimit(limit: 11, duration: 60)
        }
      `;

      const schema = makeExecutableSchema({
        resolvers: { Query: { test: () => "success" } },
        typeDefs,
      });

      const rateLimitTransformer = createRateLimitDirective(config);
      expect(() => rateLimitTransformer(schema)).toThrow(
        "Maximum allowed is 10",
      );
    });

    it("should reject schemas exceeding limiter cache size limit", () => {
      const config: RateLimitDirectiveConfig = {
        limiterClass: RateLimiterRedis,
        limiterOptions: { storeClient: mockRedisClient },
        runtimeLimits: { maxLimiterCacheSize: 1 },
      };

      const typeDefs = `
        ${rateLimitDirectiveTypeDefs}
        type Query {
          one: String @rateLimit(limit: 1, duration: 60)
          two: String @rateLimit(limit: 2, duration: 60)
        }
      `;

      const schema = makeExecutableSchema({
        resolvers: {
          Query: {
            one: () => "one",
            two: () => "two",
          },
        },
        typeDefs,
      });

      const rateLimitTransformer = createRateLimitDirective(config);
      expect(() => rateLimitTransformer(schema)).toThrow(
        "Limiter cache size exceeded (1)",
      );
    });

    it("should reject invalid runtime limits at setup", () => {
      const config: RateLimitDirectiveConfig = {
        limiterClass: RateLimiterRedis,
        limiterOptions: { storeClient: mockRedisClient },
        runtimeLimits: { maxKeyLength: 0 },
      };

      expect(() => createRateLimitDirective(config)).toThrow(
        'Invalid runtime limit "maxKeyLength"',
      );
    });

    it("should reject invalid service error mode", () => {
      const config = {
        limiterClass: RateLimiterRedis,
        limiterOptions: { storeClient: mockRedisClient },
        serviceErrorMode: "invalid-mode",
      } as unknown as RateLimitDirectiveConfig;

      expect(() => createRateLimitDirective(config)).toThrow(
        "Invalid serviceErrorMode",
      );
    });

    it("should reject null config object in JavaScript usage", () => {
      const config = null as unknown as RateLimitDirectiveConfig;

      expect(() => createRateLimitDirective(config)).toThrow(
        "config must be an object",
      );
    });

    it("should reject non-object limiter options in JavaScript config", () => {
      const config = {
        limiterClass: RateLimiterRedis,
        limiterOptions: [],
      } as unknown as RateLimitDirectiveConfig;

      expect(() => createRateLimitDirective(config)).toThrow(
        "limiterOptions must be an object",
      );
    });

    it("should reject invalid key generator type in JavaScript config", () => {
      const config = {
        keyGenerator: "not-a-function",
        limiterClass: RateLimiterRedis,
        limiterOptions: { storeClient: mockRedisClient },
      } as unknown as RateLimitDirectiveConfig;

      expect(() => createRateLimitDirective(config)).toThrow(
        "keyGenerator must be a function",
      );
    });

    it("should reject non-object runtime limits in JavaScript config", () => {
      const config = {
        limiterClass: RateLimiterRedis,
        limiterOptions: { storeClient: mockRedisClient },
        runtimeLimits: "strict-mode",
      } as unknown as RateLimitDirectiveConfig;

      expect(() => createRateLimitDirective(config)).toThrow(
        "runtimeLimits must be an object",
      );
    });

    it("should reject missing store client in JavaScript config", () => {
      const config = {
        limiterClass: RateLimiterRedis,
        limiterOptions: {},
      } as unknown as RateLimitDirectiveConfig;

      expect(() => createRateLimitDirective(config)).toThrow(
        "storeClient is required",
      );
    });

    it("should reject null store client in JavaScript config", () => {
      const config = {
        limiterClass: RateLimiterRedis,
        limiterOptions: { storeClient: null },
      } as unknown as RateLimitDirectiveConfig;

      expect(() => createRateLimitDirective(config)).toThrow(
        "storeClient is required",
      );
    });
  });

  describe("Rate Limiting Behavior", () => {
    it("should allow requests within limit", async () => {
      consumeSpy.mockResolvedValue(undefined);

      const schema = buildRateLimitedSchema({
        config: {
          limiterClass: createMockLimiterClass(consumeSpy),
          limiterOptions: { storeClient: mockRedisClient },
        },
      });

      const result = await executeTestQuery(schema);

      expect(result.errors).toBeUndefined();
      expect(result.data?.test).toBe("success");
      expect(consumeSpy).toHaveBeenCalledWith("anonymous:Query.test");
    });

    it("should reject requests exceeding limit", async () => {
      const rateLimitError = new Error("Rate limit exceeded");
      Object.assign(rateLimitError, { msBeforeNext: 5000 });
      consumeSpy.mockRejectedValue(rateLimitError);

      const schema = buildRateLimitedSchema({
        config: {
          limiterClass: createMockLimiterClass(consumeSpy),
          limiterOptions: { storeClient: mockRedisClient },
        },
        rateLimitDirective: "@rateLimit(limit: 1, duration: 60)",
      });

      const result = await executeTestQuery(schema);

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].message).toBe("Rate limit exceeded");
      expect(result.errors?.[0].extensions?.code).toBe("RATE_LIMITED");
      expect(result.errors?.[0].extensions?.http).toEqual({ status: 429 });
      expect(result.errors?.[0].extensions?.retryAfter).toBe(5);
    });

    it("should sanitize invalid retryAfter values", async () => {
      const rateLimitError = new Error("Rate limit exceeded");
      Object.assign(rateLimitError, { msBeforeNext: -1000 });
      consumeSpy.mockRejectedValue(rateLimitError);

      const schema = buildRateLimitedSchema({
        config: {
          limiterClass: createMockLimiterClass(consumeSpy),
          limiterOptions: { storeClient: mockRedisClient },
        },
        rateLimitDirective: "@rateLimit(limit: 1, duration: 60)",
      });

      const result = await executeTestQuery(schema);

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].extensions?.retryAfter).toBe(1);
    });

    it("should use custom key generator", async () => {
      consumeSpy.mockResolvedValue(undefined);
      const customKeyGenerator = vi.fn(() => "custom:key");

      const schema = buildRateLimitedSchema({
        config: {
          keyGenerator: customKeyGenerator,
          limiterClass: createMockLimiterClass(consumeSpy),
          limiterOptions: { storeClient: mockRedisClient },
        },
      });

      const result = await executeTestQuery(schema);

      expect(result.errors).toBeUndefined();
      expect(customKeyGenerator).toHaveBeenCalled();
      expect(consumeSpy).toHaveBeenCalledWith("custom:key");
    });

    it("should support async key generator", async () => {
      consumeSpy.mockResolvedValue(undefined);
      const asyncKeyGenerator = vi.fn(async () => "async:key");

      const schema = buildRateLimitedSchema({
        config: {
          keyGenerator: asyncKeyGenerator,
          limiterClass: createMockLimiterClass(consumeSpy),
          limiterOptions: { storeClient: mockRedisClient },
        },
      });

      const result = await executeTestQuery(schema);

      expect(result.errors).toBeUndefined();
      expect(asyncKeyGenerator).toHaveBeenCalled();
      expect(consumeSpy).toHaveBeenCalledWith("async:key");
    });

    it("should apply default key generator options from config", async () => {
      consumeSpy.mockResolvedValue(undefined);

      const schema = buildRateLimitedSchema({
        config: {
          defaultKeyGeneratorOptions: { trustProxy: true },
          limiterClass: createMockLimiterClass(consumeSpy),
          limiterOptions: { storeClient: mockRedisClient },
        },
      });

      const result = await executeTestQuery(schema, "{ test }", {
        req: {
          headers: { "x-forwarded-for": "203.0.113.10" },
        },
      });

      expect(result.errors).toBeUndefined();
      expect(result.data?.test).toBe("success");
      expect(consumeSpy).toHaveBeenCalledWith("ip:203.0.113.10:Query.test");
    });
  });

  describe("Limiter Instance Sharing", () => {
    it("should reuse limiter for same configuration", async () => {
      consumeSpy.mockResolvedValue(undefined);
      const { MockClass, getCount } =
        createCountingMockLimiterClass(consumeSpy);

      const schema = buildRateLimitedSchema({
        config: {
          limiterClass: MockClass,
          limiterOptions: { storeClient: mockRedisClient },
        },
        resolvers: {
          Query: {
            test1: () => "success1",
            test2: () => "success2",
          },
        },
        typeDefs: `
          ${rateLimitDirectiveTypeDefs}
          type Query {
            test1: String @rateLimit(limit: 5, duration: 60)
            test2: String @rateLimit(limit: 5, duration: 60)
          }
        `,
      });

      const result = await executeTestQuery(schema, "{ test1 test2 }");

      expect(result.errors).toBeUndefined();
      expect(getCount()).toBe(1);
      expect(consumeSpy).toHaveBeenCalledTimes(2);
    });

    it("should create different limiters for different configurations", async () => {
      consumeSpy.mockResolvedValue(undefined);
      const { MockClass, getCount } =
        createCountingMockLimiterClass(consumeSpy);

      const schema = buildRateLimitedSchema({
        config: {
          limiterClass: MockClass,
          limiterOptions: { storeClient: mockRedisClient },
        },
        resolvers: {
          Query: {
            test1: () => "success1",
            test2: () => "success2",
          },
        },
        typeDefs: `
          ${rateLimitDirectiveTypeDefs}
          type Query {
            test1: String @rateLimit(limit: 5, duration: 60)
            test2: String @rateLimit(limit: 10, duration: 60)
          }
        `,
      });

      const result = await executeTestQuery(schema, "{ test1 test2 }");

      expect(result.errors).toBeUndefined();
      expect(getCount()).toBe(2);
      expect(consumeSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("Error Handling", () => {
    it("should throw limiter constructor errors at schema setup time", () => {
      class FailingLimiter {
        constructor() {
          throw new Error("constructor failure");
        }

        consume = consumeSpy;
      }

      expect(() =>
        buildRateLimitedSchema({
          config: {
            limiterClass: FailingLimiter,
            limiterOptions: { storeClient: mockRedisClient },
          },
        }),
      ).toThrow("constructor failure");
    });

    it("should reject limiter instances missing consume() at schema setup time", () => {
      class InvalidLimiter {}

      expect(() =>
        buildRateLimitedSchema({
          config: {
            limiterClass:
              InvalidLimiter as unknown as RateLimitDirectiveConfig["limiterClass"],
            limiterOptions: { storeClient: mockRedisClient },
          },
        }),
      ).toThrow("instances must expose a consume(key) method");
    });

    it("should handle Redis connection errors", async () => {
      consumeSpy.mockRejectedValue(new Error("ECONNREFUSED"));

      const schema = buildRateLimitedSchema({
        config: {
          limiterClass: createMockLimiterClass(consumeSpy),
          limiterOptions: { storeClient: mockRedisClient },
        },
      });

      const result = await executeTestQuery(schema);

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].message).toBe(
        "Rate limiting service unavailable",
      );
      expect(result.errors?.[0].extensions?.code).toBe(
        "RATE_LIMIT_SERVICE_ERROR",
      );
      expect(result.errors?.[0].extensions?.http).toEqual({ status: 503 });
    });

    it("should allow resolver execution on service failure in failOpen mode", async () => {
      consumeSpy.mockRejectedValue(new Error("ECONNREFUSED"));

      const schema = buildRateLimitedSchema({
        config: {
          limiterClass: createMockLimiterClass(consumeSpy),
          limiterOptions: { storeClient: mockRedisClient },
          serviceErrorMode: "failOpen",
        },
      });

      const result = await executeTestQuery(schema);

      expect(result.errors).toBeUndefined();
      expect(result.data?.test).toBe("success");
    });

    it("should propagate other GraphQL errors", async () => {
      consumeSpy.mockResolvedValue(undefined);

      const schema = buildRateLimitedSchema({
        config: {
          limiterClass: createMockLimiterClass(consumeSpy),
          limiterOptions: { storeClient: mockRedisClient },
        },
        resolvers: {
          Query: {
            test: () => {
              throw new GraphQLError("Custom error");
            },
          },
        },
      });

      const result = await executeTestQuery(schema);

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].message).toBe("Custom error");
    });

    it("should hide key generator internal errors", async () => {
      consumeSpy.mockResolvedValue(undefined);

      const schema = buildRateLimitedSchema({
        config: {
          keyGenerator: () => {
            throw new Error("internal implementation details");
          },
          limiterClass: createMockLimiterClass(consumeSpy),
          limiterOptions: { storeClient: mockRedisClient },
        },
      });

      const result = await executeTestQuery(schema);

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].message).toBe(
        "Rate limiting key generation failed",
      );
      expect(result.errors?.[0].extensions?.code).toBe("RATE_LIMIT_KEY_ERROR");
      expect(result.errors?.[0].extensions?.http).toEqual({ status: 500 });
      expect(consumeSpy).not.toHaveBeenCalled();
    });

    it("should hide async key generator internal errors", async () => {
      consumeSpy.mockResolvedValue(undefined);

      const schema = buildRateLimitedSchema({
        config: {
          keyGenerator: async () => {
            throw new Error("async failure");
          },
          limiterClass: createMockLimiterClass(consumeSpy),
          limiterOptions: { storeClient: mockRedisClient },
        },
      });

      const result = await executeTestQuery(schema);

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].message).toBe(
        "Rate limiting key generation failed",
      );
      expect(result.errors?.[0].extensions?.code).toBe("RATE_LIMIT_KEY_ERROR");
      expect(consumeSpy).not.toHaveBeenCalled();
    });

    it("should reject invalid key generator output", async () => {
      consumeSpy.mockResolvedValue(undefined);

      const schema = buildRateLimitedSchema({
        config: {
          keyGenerator: () => "",
          limiterClass: createMockLimiterClass(consumeSpy),
          limiterOptions: { storeClient: mockRedisClient },
        },
      });

      const result = await executeTestQuery(schema);

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].message).toBe(
        "Rate limiting key generation failed",
      );
      expect(result.errors?.[0].extensions?.code).toBe("RATE_LIMIT_KEY_ERROR");
      expect(result.errors?.[0].extensions?.http).toEqual({ status: 500 });
      expect(consumeSpy).not.toHaveBeenCalled();
    });

    it("should reject keys exceeding max key length", async () => {
      consumeSpy.mockResolvedValue(undefined);
      const longKey = "k".repeat(513);

      const schema = buildRateLimitedSchema({
        config: {
          keyGenerator: () => longKey,
          limiterClass: createMockLimiterClass(consumeSpy),
          limiterOptions: { storeClient: mockRedisClient },
        },
      });

      const result = await executeTestQuery(schema);

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].message).toBe(
        "Rate limiting key generation failed",
      );
      expect(result.errors?.[0].extensions?.code).toBe("RATE_LIMIT_KEY_ERROR");
      expect(consumeSpy).not.toHaveBeenCalled();
    });

    it("should accept keys at exactly max key length", async () => {
      consumeSpy.mockResolvedValue(undefined);
      const exactKey = "k".repeat(512);

      const schema = buildRateLimitedSchema({
        config: {
          keyGenerator: () => exactKey,
          limiterClass: createMockLimiterClass(consumeSpy),
          limiterOptions: { storeClient: mockRedisClient },
        },
      });

      const result = await executeTestQuery(schema);

      expect(result.errors).toBeUndefined();
      expect(result.data?.test).toBe("success");
      expect(consumeSpy).toHaveBeenCalledWith(exactKey);
    });
  });

  describe("Fields Without Directive", () => {
    it("should not apply rate limiting to fields without directive", async () => {
      consumeSpy.mockResolvedValue(undefined);

      const schema = buildRateLimitedSchema({
        config: {
          limiterClass: createMockLimiterClass(consumeSpy),
          limiterOptions: { storeClient: mockRedisClient },
        },
        resolvers: {
          Query: {
            limited: () => "limited",
            unlimited: () => "unlimited",
          },
        },
        typeDefs: `
          ${rateLimitDirectiveTypeDefs}
          type Query {
            limited: String @rateLimit(limit: 5, duration: 60)
            unlimited: String
          }
        `,
      });

      const result = await executeTestQuery(schema, "{ unlimited }");

      expect(result.errors).toBeUndefined();
      expect(result.data?.unlimited).toBe("unlimited");
      expect(consumeSpy).not.toHaveBeenCalled();
    });
  });
});
