import { buildSchema } from "graphql";
import { describe, expect, it } from "vitest";
import type { RateLimitDirectiveArgs } from "../types.js";
import {
  createCompositeKeyGenerator,
  createIPKeyGenerator,
  createUserKeyGenerator,
  defaultKeyGenerator,
} from "../types.js";

describe("Key Generators", () => {
  const _schema = buildSchema(`
    type Query {
      test: String
    }
  `);

  const mockDirectiveArgs: RateLimitDirectiveArgs = {
    duration: 60,
    limit: 10,
  };

  const mockInfo = {
    fieldName: "test",
    parentType: {
      name: "Query",
    },
  } as any;

  describe("defaultKeyGenerator", () => {
    it("should generate key based on parent type and field name", () => {
      const key = defaultKeyGenerator(
        mockDirectiveArgs,
        null,
        {},
        null,
        mockInfo,
      );

      expect(key).toBe("Query.test");
    });

    it("should generate different keys for different fields", () => {
      const key1 = defaultKeyGenerator(mockDirectiveArgs, null, {}, null, {
        ...mockInfo,
        fieldName: "field1",
      });

      const key2 = defaultKeyGenerator(mockDirectiveArgs, null, {}, null, {
        ...mockInfo,
        fieldName: "field2",
      });

      expect(key1).toBe("Query.field1");
      expect(key2).toBe("Query.field2");
      expect(key1).not.toBe(key2);
    });

    it("should generate different keys for different parent types", () => {
      const key1 = defaultKeyGenerator(mockDirectiveArgs, null, {}, null, {
        ...mockInfo,
        parentType: { name: "Query" },
      });

      const key2 = defaultKeyGenerator(mockDirectiveArgs, null, {}, null, {
        ...mockInfo,
        parentType: { name: "Mutation" },
      });

      expect(key1).toBe("Query.test");
      expect(key2).toBe("Mutation.test");
      expect(key1).not.toBe(key2);
    });
  });

  describe("createUserKeyGenerator", () => {
    it("should generate key based on user ID", () => {
      const getUserId = (context: any) => context.user?.id;
      const keyGenerator = createUserKeyGenerator(getUserId);

      const context = {
        user: { id: "user123" },
      };

      const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

      expect(key).toBe("user:user123:Query.test");
    });

    it("should use 'anonymous' for missing user", () => {
      const getUserId = (context: any) => context.user?.id;
      const keyGenerator = createUserKeyGenerator(getUserId);

      const context = {};

      const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

      expect(key).toBe("user:anonymous:Query.test");
    });

    it("should use 'anonymous' for null user ID", () => {
      const getUserId = (context: any) => context.user?.id;
      const keyGenerator = createUserKeyGenerator(getUserId);

      const context = {
        user: { id: null },
      };

      const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

      expect(key).toBe("user:anonymous:Query.test");
    });

    it("should use 'anonymous' for undefined user ID", () => {
      const getUserId = (context: any) => context.user?.id;
      const keyGenerator = createUserKeyGenerator(getUserId);

      const context = {
        user: { id: undefined },
      };

      const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

      expect(key).toBe("user:anonymous:Query.test");
    });

    it("should generate different keys for different users", () => {
      const getUserId = (context: any) => context.user?.id;
      const keyGenerator = createUserKeyGenerator(getUserId);

      const context1 = {
        user: { id: "user1" },
      };

      const context2 = {
        user: { id: "user2" },
      };

      const key1 = keyGenerator(
        mockDirectiveArgs,
        null,
        {},
        context1,
        mockInfo,
      );
      const key2 = keyGenerator(
        mockDirectiveArgs,
        null,
        {},
        context2,
        mockInfo,
      );

      expect(key1).toBe("user:user1:Query.test");
      expect(key2).toBe("user:user2:Query.test");
      expect(key1).not.toBe(key2);
    });

    it("should include field name in key", () => {
      const getUserId = (context: any) => context.user?.id;
      const keyGenerator = createUserKeyGenerator(getUserId);

      const context = {
        user: { id: "user123" },
      };

      const key1 = keyGenerator(mockDirectiveArgs, null, {}, context, {
        ...mockInfo,
        fieldName: "field1",
      });

      const key2 = keyGenerator(mockDirectiveArgs, null, {}, context, {
        ...mockInfo,
        fieldName: "field2",
      });

      expect(key1).toBe("user:user123:Query.field1");
      expect(key2).toBe("user:user123:Query.field2");
      expect(key1).not.toBe(key2);
    });
  });

  describe("createIPKeyGenerator", () => {
    it("should generate key based on IP address", () => {
      const getIP = (context: any) => context.req?.ip;
      const keyGenerator = createIPKeyGenerator(getIP);

      const context = {
        req: { ip: "192.168.1.1" },
      };

      const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

      expect(key).toBe("ip:192.168.1.1:Query.test");
    });

    it("should use 'unknown' for missing IP", () => {
      const getIP = (context: any) => context.req?.ip;
      const keyGenerator = createIPKeyGenerator(getIP);

      const context = {};

      const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

      expect(key).toBe("ip:unknown:Query.test");
    });

    it("should use 'unknown' for null IP", () => {
      const getIP = (context: any) => context.req?.ip;
      const keyGenerator = createIPKeyGenerator(getIP);

      const context = {
        req: { ip: null },
      };

      const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

      expect(key).toBe("ip:unknown:Query.test");
    });

    it("should use 'unknown' for undefined IP", () => {
      const getIP = (context: any) => context.req?.ip;
      const keyGenerator = createIPKeyGenerator(getIP);

      const context = {
        req: { ip: undefined },
      };

      const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

      expect(key).toBe("ip:unknown:Query.test");
    });

    it("should generate different keys for different IPs", () => {
      const getIP = (context: any) => context.req?.ip;
      const keyGenerator = createIPKeyGenerator(getIP);

      const context1 = {
        req: { ip: "192.168.1.1" },
      };

      const context2 = {
        req: { ip: "192.168.1.2" },
      };

      const key1 = keyGenerator(
        mockDirectiveArgs,
        null,
        {},
        context1,
        mockInfo,
      );
      const key2 = keyGenerator(
        mockDirectiveArgs,
        null,
        {},
        context2,
        mockInfo,
      );

      expect(key1).toBe("ip:192.168.1.1:Query.test");
      expect(key2).toBe("ip:192.168.1.2:Query.test");
      expect(key1).not.toBe(key2);
    });

    it("should handle x-forwarded-for header", () => {
      const getIP = (context: any) =>
        context.req?.ip || context.req?.headers?.["x-forwarded-for"];
      const keyGenerator = createIPKeyGenerator(getIP);

      const context = {
        req: {
          headers: {
            "x-forwarded-for": "203.0.113.1",
          },
        },
      };

      const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

      expect(key).toBe("ip:203.0.113.1:Query.test");
    });

    it("should include field name in key", () => {
      const getIP = (context: any) => context.req?.ip;
      const keyGenerator = createIPKeyGenerator(getIP);

      const context = {
        req: { ip: "192.168.1.1" },
      };

      const key1 = keyGenerator(mockDirectiveArgs, null, {}, context, {
        ...mockInfo,
        fieldName: "field1",
      });

      const key2 = keyGenerator(mockDirectiveArgs, null, {}, context, {
        ...mockInfo,
        fieldName: "field2",
      });

      expect(key1).toBe("ip:192.168.1.1:Query.field1");
      expect(key2).toBe("ip:192.168.1.1:Query.field2");
      expect(key1).not.toBe(key2);
    });
  });

  describe("createCompositeKeyGenerator", () => {
    it("should generate key based on multiple identifiers", () => {
      const getIdentifiers = (context: any) => ({
        apiKey: context.apiKey,
        userId: context.user?.id,
      });
      const keyGenerator = createCompositeKeyGenerator(getIdentifiers);

      const context = {
        apiKey: "key123",
        user: { id: "user123" },
      };

      const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

      expect(key).toBe("apiKey:key123:userId:user123:Query.test");
    });

    it("should filter out null identifiers", () => {
      const getIdentifiers = (context: any) => ({
        apiKey: context.apiKey,
        userId: context.user?.id,
      });
      const keyGenerator = createCompositeKeyGenerator(getIdentifiers);

      const context = {
        apiKey: "key123",
        user: { id: null },
      };

      const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

      expect(key).toBe("apiKey:key123:Query.test");
    });

    it("should filter out undefined identifiers", () => {
      const getIdentifiers = (context: any) => ({
        apiKey: context.apiKey,
        userId: context.user?.id,
      });
      const keyGenerator = createCompositeKeyGenerator(getIdentifiers);

      const context = {
        apiKey: "key123",
      };

      const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

      expect(key).toBe("apiKey:key123:Query.test");
    });

    it("should handle all null identifiers", () => {
      const getIdentifiers = (context: any) => ({
        apiKey: context.apiKey,
        userId: context.user?.id,
      });
      const keyGenerator = createCompositeKeyGenerator(getIdentifiers);

      const context = {};

      const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

      expect(key).toBe(":Query.test");
    });

    it("should maintain identifier order", () => {
      const getIdentifiers = (context: any) => ({
        a: context.a,
        b: context.b,
        c: context.c,
      });
      const keyGenerator = createCompositeKeyGenerator(getIdentifiers);

      const context = {
        a: "1",
        b: "2",
        c: "3",
      };

      const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

      expect(key).toBe("a:1:b:2:c:3:Query.test");
    });

    it("should include field name in key", () => {
      const getIdentifiers = (context: any) => ({
        userId: context.user?.id,
      });
      const keyGenerator = createCompositeKeyGenerator(getIdentifiers);

      const context = {
        user: { id: "user123" },
      };

      const key1 = keyGenerator(mockDirectiveArgs, null, {}, context, {
        ...mockInfo,
        fieldName: "field1",
      });

      const key2 = keyGenerator(mockDirectiveArgs, null, {}, context, {
        ...mockInfo,
        fieldName: "field2",
      });

      expect(key1).toBe("userId:user123:Query.field1");
      expect(key2).toBe("userId:user123:Query.field2");
      expect(key1).not.toBe(key2);
    });

    it("should handle complex identifier combinations", () => {
      const getIdentifiers = (context: any) => ({
        apiKey: context.apiKey,
        ip: context.req?.ip,
        userId: context.user?.id,
      });
      const keyGenerator = createCompositeKeyGenerator(getIdentifiers);

      const context = {
        apiKey: "key123",
        req: { ip: "192.168.1.1" },
        user: { id: "user123" },
      };

      const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

      expect(key).toBe(
        "apiKey:key123:ip:192.168.1.1:userId:user123:Query.test",
      );
    });

    it("should generate different keys for different identifier values", () => {
      const getIdentifiers = (context: any) => ({
        userId: context.user?.id,
      });
      const keyGenerator = createCompositeKeyGenerator(getIdentifiers);

      const context1 = {
        user: { id: "user1" },
      };

      const context2 = {
        user: { id: "user2" },
      };

      const key1 = keyGenerator(
        mockDirectiveArgs,
        null,
        {},
        context1,
        mockInfo,
      );
      const key2 = keyGenerator(
        mockDirectiveArgs,
        null,
        {},
        context2,
        mockInfo,
      );

      expect(key1).toBe("userId:user1:Query.test");
      expect(key2).toBe("userId:user2:Query.test");
      expect(key1).not.toBe(key2);
    });
  });
});
