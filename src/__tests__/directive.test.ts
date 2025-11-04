import { makeExecutableSchema } from "@graphql-tools/schema";
import { execute, GraphQLError, parse } from "graphql";
import { RateLimiterRedis } from "rate-limiter-flexible";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createRateLimitDirective,
  rateLimitDirectiveTypeDefs,
} from "../directive.js";
import type { RateLimitDirectiveConfig } from "../types.js";

describe("RateLimitDirective", () => {
  let mockRedisClient: any;
  let consumeSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    // Mock Redis client
    mockRedisClient = {
      on: vi.fn(),
      quit: vi.fn(),
    };

    // Create a spy for the consume method
    consumeSpy = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("Input Validation", () => {
    it("should reject negative limit", async () => {
      const typeDefs = `
        ${rateLimitDirectiveTypeDefs}
        type Query {
          test: String @rateLimit(limit: -1, duration: 60)
        }
      `;

      const config: RateLimitDirectiveConfig = {
        limiterClass: RateLimiterRedis,
        limiterOptions: {
          storeClient: mockRedisClient,
        },
      };

      expect(() => {
        makeExecutableSchema({
          typeDefs,
          resolvers: {
            Query: {
              test: () => "success",
            },
          },
        });
      }).not.toThrow();

      const schema = makeExecutableSchema({
        typeDefs,
        resolvers: {
          Query: {
            test: () => "success",
          },
        },
      });

      const rateLimitTransformer = createRateLimitDirective(config);
      const transformedSchema = rateLimitTransformer(schema);

      const query = "{ test }";
      const result = await execute({
        schema: transformedSchema,
        document: parse(query),
      });

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].message).toContain("Invalid rate limit");
    });

    it("should reject zero limit", async () => {
      const typeDefs = `
        ${rateLimitDirectiveTypeDefs}
        type Query {
          test: String @rateLimit(limit: 0, duration: 60)
        }
      `;

      const config: RateLimitDirectiveConfig = {
        limiterClass: RateLimiterRedis,
        limiterOptions: {
          storeClient: mockRedisClient,
        },
      };

      const schema = makeExecutableSchema({
        typeDefs,
        resolvers: {
          Query: {
            test: () => "success",
          },
        },
      });

      const rateLimitTransformer = createRateLimitDirective(config);
      const transformedSchema = rateLimitTransformer(schema);

      const query = "{ test }";
      const result = await execute({
        schema: transformedSchema,
        document: parse(query),
      });

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].message).toContain("Invalid rate limit");
    });

    it("should reject negative duration", async () => {
      const typeDefs = `
        ${rateLimitDirectiveTypeDefs}
        type Query {
          test: String @rateLimit(limit: 10, duration: -1)
        }
      `;

      const config: RateLimitDirectiveConfig = {
        limiterClass: RateLimiterRedis,
        limiterOptions: {
          storeClient: mockRedisClient,
        },
      };

      const schema = makeExecutableSchema({
        typeDefs,
        resolvers: {
          Query: {
            test: () => "success",
          },
        },
      });

      const rateLimitTransformer = createRateLimitDirective(config);
      const transformedSchema = rateLimitTransformer(schema);

      const query = "{ test }";
      const result = await execute({
        schema: transformedSchema,
        document: parse(query),
      });

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].message).toContain("Invalid duration");
    });

    it("should reject duration exceeding 1 year", async () => {
      const typeDefs = `
        ${rateLimitDirectiveTypeDefs}
        type Query {
          test: String @rateLimit(limit: 10, duration: 31536001)
        }
      `;

      const config: RateLimitDirectiveConfig = {
        limiterClass: RateLimiterRedis,
        limiterOptions: {
          storeClient: mockRedisClient,
        },
      };

      const schema = makeExecutableSchema({
        typeDefs,
        resolvers: {
          Query: {
            test: () => "success",
          },
        },
      });

      const rateLimitTransformer = createRateLimitDirective(config);
      const transformedSchema = rateLimitTransformer(schema);

      const query = "{ test }";
      const result = await execute({
        schema: transformedSchema,
        document: parse(query),
      });

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].message).toContain(
        "Maximum allowed is 31536000",
      );
    });

    it("should reject limit exceeding 1 million", async () => {
      const typeDefs = `
        ${rateLimitDirectiveTypeDefs}
        type Query {
          test: String @rateLimit(limit: 1000001, duration: 60)
        }
      `;

      const config: RateLimitDirectiveConfig = {
        limiterClass: RateLimiterRedis,
        limiterOptions: {
          storeClient: mockRedisClient,
        },
      };

      const schema = makeExecutableSchema({
        typeDefs,
        resolvers: {
          Query: {
            test: () => "success",
          },
        },
      });

      const rateLimitTransformer = createRateLimitDirective(config);
      const transformedSchema = rateLimitTransformer(schema);

      const query = "{ test }";
      const result = await execute({
        schema: transformedSchema,
        document: parse(query),
      });

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].message).toContain(
        "Maximum allowed is 1000000",
      );
    });

    it("should accept valid limit and duration", async () => {
      consumeSpy.mockResolvedValue(undefined);

      // Mock RateLimiterRedis constructor using class syntax
      class MockRateLimiterRedis {
        consume = consumeSpy;
      }

      const typeDefs = `
        ${rateLimitDirectiveTypeDefs}
        type Query {
          test: String @rateLimit(limit: 10, duration: 60)
        }
      `;

      const config: RateLimitDirectiveConfig = {
        limiterClass: MockRateLimiterRedis as any,
        limiterOptions: {
          storeClient: mockRedisClient,
        },
      };

      const schema = makeExecutableSchema({
        typeDefs,
        resolvers: {
          Query: {
            test: () => "success",
          },
        },
      });

      const rateLimitTransformer = createRateLimitDirective(config);
      const transformedSchema = rateLimitTransformer(schema);

      const query = "{ test }";
      const result = await execute({
        schema: transformedSchema,
        document: parse(query),
      });

      expect(result.errors).toBeUndefined();
      expect(result.data?.test).toBe("success");
      expect(consumeSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe("Rate Limiting Behavior", () => {
    it("should allow requests within limit", async () => {
      consumeSpy.mockResolvedValue(undefined);

      class MockRateLimiterRedis {
        consume = consumeSpy;
      }

      const typeDefs = `
        ${rateLimitDirectiveTypeDefs}
        type Query {
          test: String @rateLimit(limit: 5, duration: 60)
        }
      `;

      const config: RateLimitDirectiveConfig = {
        limiterClass: MockRateLimiterRedis as any,
        limiterOptions: {
          storeClient: mockRedisClient,
        },
      };

      const schema = makeExecutableSchema({
        typeDefs,
        resolvers: {
          Query: {
            test: () => "success",
          },
        },
      });

      const rateLimitTransformer = createRateLimitDirective(config);
      const transformedSchema = rateLimitTransformer(schema);

      const query = "{ test }";
      const result = await execute({
        schema: transformedSchema,
        document: parse(query),
      });

      expect(result.errors).toBeUndefined();
      expect(result.data?.test).toBe("success");
      expect(consumeSpy).toHaveBeenCalledWith("Query.test");
    });

    it("should reject requests exceeding limit", async () => {
      const rateLimitError = new Error("Rate limit exceeded");
      (rateLimitError as any).msBeforeNext = 5000;

      consumeSpy.mockRejectedValue(rateLimitError);

      class MockRateLimiterRedis {
        consume = consumeSpy;
      }

      const typeDefs = `
        ${rateLimitDirectiveTypeDefs}
        type Query {
          test: String @rateLimit(limit: 1, duration: 60)
        }
      `;

      const config: RateLimitDirectiveConfig = {
        limiterClass: MockRateLimiterRedis as any,
        limiterOptions: {
          storeClient: mockRedisClient,
        },
      };

      const schema = makeExecutableSchema({
        typeDefs,
        resolvers: {
          Query: {
            test: () => "success",
          },
        },
      });

      const rateLimitTransformer = createRateLimitDirective(config);
      const transformedSchema = rateLimitTransformer(schema);

      const query = "{ test }";
      const result = await execute({
        schema: transformedSchema,
        document: parse(query),
      });

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].message).toBe("Rate limit exceeded");
      expect(result.errors?.[0].extensions?.code).toBe("RATE_LIMITED");
      expect(result.errors?.[0].extensions?.http).toEqual({ status: 429 });
      expect(result.errors?.[0].extensions?.retryAfter).toBe(5);
    });

    it("should use custom key generator", async () => {
      consumeSpy.mockResolvedValue(undefined);

      class MockRateLimiterRedis {
        consume = consumeSpy;
      }

      const customKeyGenerator = vi.fn(() => "custom:key");

      const typeDefs = `
        ${rateLimitDirectiveTypeDefs}
        type Query {
          test: String @rateLimit(limit: 5, duration: 60)
        }
      `;

      const config: RateLimitDirectiveConfig = {
        keyGenerator: customKeyGenerator,
        limiterClass: MockRateLimiterRedis as any,
        limiterOptions: {
          storeClient: mockRedisClient,
        },
      };

      const schema = makeExecutableSchema({
        typeDefs,
        resolvers: {
          Query: {
            test: () => "success",
          },
        },
      });

      const rateLimitTransformer = createRateLimitDirective(config);
      const transformedSchema = rateLimitTransformer(schema);

      const query = "{ test }";
      const result = await execute({
        schema: transformedSchema,
        document: parse(query),
      });

      expect(result.errors).toBeUndefined();
      expect(customKeyGenerator).toHaveBeenCalled();
      expect(consumeSpy).toHaveBeenCalledWith("custom:key");
    });
  });

  describe("LRU Cache", () => {
    it("should reuse limiter for same configuration", async () => {
      consumeSpy.mockResolvedValue(undefined);

      let instanceCount = 0;
      class MockRateLimiterRedis {
        consume = consumeSpy;
        constructor(_options: any) {
          instanceCount++;
        }
      }

      const typeDefs = `
        ${rateLimitDirectiveTypeDefs}
        type Query {
          test1: String @rateLimit(limit: 5, duration: 60)
          test2: String @rateLimit(limit: 5, duration: 60)
        }
      `;

      const config: RateLimitDirectiveConfig = {
        limiterClass: MockRateLimiterRedis as any,
        limiterOptions: {
          storeClient: mockRedisClient,
        },
      };

      const schema = makeExecutableSchema({
        typeDefs,
        resolvers: {
          Query: {
            test1: () => "success1",
            test2: () => "success2",
          },
        },
      });

      const rateLimitTransformer = createRateLimitDirective(config);
      const transformedSchema = rateLimitTransformer(schema);

      const query = "{ test1 test2 }";
      const result = await execute({
        schema: transformedSchema,
        document: parse(query),
      });

      expect(result.errors).toBeUndefined();
      // Should only create one limiter instance for both fields
      expect(instanceCount).toBe(1);
      // But consume should be called twice (once per field)
      expect(consumeSpy).toHaveBeenCalledTimes(2);
    });

    it("should create different limiters for different configurations", async () => {
      consumeSpy.mockResolvedValue(undefined);

      let instanceCount = 0;
      class MockRateLimiterRedis {
        consume = consumeSpy;
        constructor(_options: any) {
          instanceCount++;
        }
      }

      const typeDefs = `
        ${rateLimitDirectiveTypeDefs}
        type Query {
          test1: String @rateLimit(limit: 5, duration: 60)
          test2: String @rateLimit(limit: 10, duration: 60)
        }
      `;

      const config: RateLimitDirectiveConfig = {
        limiterClass: MockRateLimiterRedis as any,
        limiterOptions: {
          storeClient: mockRedisClient,
        },
      };

      const schema = makeExecutableSchema({
        typeDefs,
        resolvers: {
          Query: {
            test1: () => "success1",
            test2: () => "success2",
          },
        },
      });

      const rateLimitTransformer = createRateLimitDirective(config);
      const transformedSchema = rateLimitTransformer(schema);

      const query = "{ test1 test2 }";
      const result = await execute({
        schema: transformedSchema,
        document: parse(query),
      });

      expect(result.errors).toBeUndefined();
      // Should create two limiter instances
      expect(instanceCount).toBe(2);
      expect(consumeSpy).toHaveBeenCalledTimes(2);
    });
  });

  describe("Error Handling", () => {
    it("should handle Redis connection errors", async () => {
      const redisError = new Error("Redis connection failed");

      consumeSpy.mockRejectedValue(redisError);

      class MockRateLimiterRedis {
        consume = consumeSpy;
      }

      const typeDefs = `
        ${rateLimitDirectiveTypeDefs}
        type Query {
          test: String @rateLimit(limit: 5, duration: 60)
        }
      `;

      const config: RateLimitDirectiveConfig = {
        limiterClass: MockRateLimiterRedis as any,
        limiterOptions: {
          storeClient: mockRedisClient,
        },
      };

      const schema = makeExecutableSchema({
        typeDefs,
        resolvers: {
          Query: {
            test: () => "success",
          },
        },
      });

      const rateLimitTransformer = createRateLimitDirective(config);
      const transformedSchema = rateLimitTransformer(schema);

      const query = "{ test }";
      const result = await execute({
        schema: transformedSchema,
        document: parse(query),
      });

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].message).toBe(
        "Rate limiting service unavailable",
      );
      expect(result.errors?.[0].extensions?.code).toBe(
        "RATE_LIMIT_SERVICE_ERROR",
      );
      expect(result.errors?.[0].extensions?.http).toEqual({ status: 503 });
    });

    it("should propagate other GraphQL errors", async () => {
      consumeSpy.mockResolvedValue(undefined);

      class MockRateLimiterRedis {
        consume = consumeSpy;
      }

      const typeDefs = `
        ${rateLimitDirectiveTypeDefs}
        type Query {
          test: String @rateLimit(limit: 5, duration: 60)
        }
      `;

      const config: RateLimitDirectiveConfig = {
        limiterClass: MockRateLimiterRedis as any,
        limiterOptions: {
          storeClient: mockRedisClient,
        },
      };

      const schema = makeExecutableSchema({
        typeDefs,
        resolvers: {
          Query: {
            test: () => {
              throw new GraphQLError("Custom error");
            },
          },
        },
      });

      const rateLimitTransformer = createRateLimitDirective(config);
      const transformedSchema = rateLimitTransformer(schema);

      const query = "{ test }";
      const result = await execute({
        schema: transformedSchema,
        document: parse(query),
      });

      expect(result.errors).toBeDefined();
      expect(result.errors?.[0].message).toBe("Custom error");
    });
  });

  describe("Fields Without Directive", () => {
    it("should not apply rate limiting to fields without directive", async () => {
      consumeSpy.mockResolvedValue(undefined);

      const MockRateLimiterRedis = vi.fn().mockImplementation(() => ({
        consume: consumeSpy,
      }));

      const typeDefs = `
        ${rateLimitDirectiveTypeDefs}
        type Query {
          limited: String @rateLimit(limit: 5, duration: 60)
          unlimited: String
        }
      `;

      const config: RateLimitDirectiveConfig = {
        limiterClass: MockRateLimiterRedis as any,
        limiterOptions: {
          storeClient: mockRedisClient,
        },
      };

      const schema = makeExecutableSchema({
        typeDefs,
        resolvers: {
          Query: {
            limited: () => "limited",
            unlimited: () => "unlimited",
          },
        },
      });

      const rateLimitTransformer = createRateLimitDirective(config);
      const transformedSchema = rateLimitTransformer(schema);

      const query = "{ unlimited }";
      const result = await execute({
        schema: transformedSchema,
        document: parse(query),
      });

      expect(result.errors).toBeUndefined();
      expect(result.data?.unlimited).toBe("unlimited");
      expect(consumeSpy).not.toHaveBeenCalled();
    });
  });
});
