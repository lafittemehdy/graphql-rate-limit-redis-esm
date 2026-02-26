import { describe, expect, it } from "vitest";
import {
	createCompositeKeyGenerator,
	createDefaultKeyGenerator,
	createIPKeyGenerator,
	createUserKeyGenerator,
	defaultKeyGenerator,
	trustProxyGuidance,
} from "../key-generators.js";
import { mockDirectiveArgs, mockInfo } from "./helpers.js";

interface UserContext {
	user?: { id?: string | null };
}

interface IPContext {
	headers?: {
		"x-forwarded-for"?: string | string[];
		"x-api-key"?: string;
	};
	req?: {
		headers?: {
			"x-forwarded-for"?: string | string[];
			"x-api-key"?: string;
		};
		ip?: string | null;
	};
}

interface CompositeContext extends UserContext, IPContext {
	a?: string;
	apiKey?: string;
	b?: string;
	c?: string;
}

describe("Key Generators", () => {
	describe("defaultKeyGenerator", () => {
		it("should generate anonymous key when context has no identity", () => {
			const key = defaultKeyGenerator(mockDirectiveArgs, null, {}, null, mockInfo);

			expect(key).toBe("anonymous:Query.test");
		});

		it("should prioritize user id when available", () => {
			const key = defaultKeyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{ user: { id: "user-123" }, req: { ip: "203.0.113.1" } },
				mockInfo,
			);

			expect(key).toBe("user:user-123:Query.test");
		});

		it("should fall back to request ip when user id is unavailable", () => {
			const key = defaultKeyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{ req: { ip: "203.0.113.1" } },
				mockInfo,
			);

			expect(key).toBe("ip:203.0.113.1:Query.test");
		});

		it("should ignore forwarded-for when trust proxy is disabled", () => {
			const key = defaultKeyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{
					req: {
						headers: {
							"x-forwarded-for": ["198.51.100.10", "198.51.100.11"],
						},
					},
				},
				mockInfo,
			);

			expect(key).toBe("anonymous:Query.test");
		});

		it("should use api key from headers as identity", () => {
			const key = defaultKeyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{
					headers: {
						"x-api-key": "api-key-123",
					},
				},
				mockInfo,
			);

			expect(key).toBe("apiKey:api-key-123:Query.test");
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

			expect(key1).toBe("anonymous:Query.field1");
			expect(key2).toBe("anonymous:Query.field2");
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

			expect(key1).toBe("anonymous:Query.test");
			expect(key2).toBe("anonymous:Mutation.test");
			expect(key1).not.toBe(key2);
		});
	});

	describe("createDefaultKeyGenerator", () => {
		it("should read forwarded-for when trust proxy is enabled", () => {
			const keyGenerator = createDefaultKeyGenerator({ trustProxy: true });
			const key = keyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{
					req: {
						headers: {
							"x-forwarded-for": ["198.51.100.10", "198.51.100.11"],
						},
					},
				},
				mockInfo,
			);

			expect(key).toBe("ip:198.51.100.10:Query.test");
		});

		it("should read forwarded-for case-insensitively when trust proxy is enabled", () => {
			const keyGenerator = createDefaultKeyGenerator({ trustProxy: true });
			const key = keyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{
					req: {
						headers: {
							"X-Forwarded-For": "203.0.113.25, 203.0.113.26",
						},
					},
				},
				mockInfo,
			);

			expect(key).toBe("ip:203.0.113.25:Query.test");
		});

		it("should read API key header case-insensitively", () => {
			const keyGenerator = createDefaultKeyGenerator();
			const key = keyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{
					headers: {
						"X-API-KEY": "api-key-upper",
					},
				},
				mockInfo,
			);

			expect(key).toBe("apiKey:api-key-upper:Query.test");
		});

		it("should read API key from Fetch Headers objects", () => {
			const keyGenerator = createDefaultKeyGenerator();
			const key = keyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{
					headers: new Headers({
						"x-api-key": "api-key-from-headers-object",
					}),
				},
				mockInfo,
			);

			expect(key).toBe("apiKey:api-key-from-headers-object:Query.test");
		});

		it("should read forwarded-for from Fetch Headers objects when trustProxy is enabled", () => {
			const keyGenerator = createDefaultKeyGenerator({ trustProxy: true });
			const key = keyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{
					req: {
						headers: new Headers({
							"x-forwarded-for": "198.51.100.20, 198.51.100.21",
						}),
					},
				},
				mockInfo,
			);

			expect(key).toBe("ip:198.51.100.20:Query.test");
		});

		it("should throw for invalid trustProxy configuration", () => {
			expect(() =>
				createDefaultKeyGenerator({
					includeIP: false,
					trustProxy: true,
				}),
			).toThrow("trustProxy requires includeIP to be enabled");
		});

		it("should expose trust proxy guidance text", () => {
			expect(trustProxyGuidance).toContain("trustProxy: true");
		});

		it("should reject non-object options in JavaScript usage", () => {
			expect(() => createDefaultKeyGenerator("invalid-options" as unknown as never)).toThrow(
				"options must be an object",
			);
		});

		it("should reject invalid option value types", () => {
			expect(() =>
				createDefaultKeyGenerator({
					includeIP: "yes" as unknown as boolean,
				}),
			).toThrow("includeIP must be a boolean");
		});

		it("should reject invalid includeApiKey option type", () => {
			expect(() =>
				createDefaultKeyGenerator({
					includeApiKey: "yes" as unknown as boolean,
				}),
			).toThrow("includeApiKey must be a boolean");
		});

		it("should reject invalid includeUserId option type", () => {
			expect(() =>
				createDefaultKeyGenerator({
					includeUserId: "yes" as unknown as boolean,
				}),
			).toThrow("includeUserId must be a boolean");
		});

		it("should reject invalid trustProxy option type", () => {
			expect(() =>
				createDefaultKeyGenerator({
					trustProxy: "yes" as unknown as boolean,
				}),
			).toThrow("trustProxy must be a boolean");
		});
	});

	describe("createUserKeyGenerator", () => {
		it("should reject invalid callback input", () => {
			expect(() => createUserKeyGenerator("invalid" as unknown as never)).toThrow(
				"getUserId must be a function",
			);
		});

		const getUserId = (context: UserContext) => context.user?.id;

		it("should generate key based on user ID", () => {
			const keyGenerator = createUserKeyGenerator(getUserId);

			const context: UserContext = {
				user: { id: "user123" },
			};

			const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

			expect(key).toBe("user:user123:Query.test");
		});

		it("should use 'anonymous' for missing user", () => {
			const keyGenerator = createUserKeyGenerator(getUserId);

			const context: UserContext = {};

			const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

			expect(key).toBe("user:anonymous:Query.test");
		});

		it("should use 'anonymous' for null user ID", () => {
			const keyGenerator = createUserKeyGenerator(getUserId);

			const context: UserContext = {
				user: { id: null },
			};

			const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

			expect(key).toBe("user:anonymous:Query.test");
		});

		it("should use 'anonymous' for undefined user ID", () => {
			const keyGenerator = createUserKeyGenerator(getUserId);

			const context: UserContext = {
				user: { id: undefined },
			};

			const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

			expect(key).toBe("user:anonymous:Query.test");
		});

		it("should generate different keys for different users", () => {
			const keyGenerator = createUserKeyGenerator(getUserId);

			const context1: UserContext = { user: { id: "user1" } };
			const context2: UserContext = { user: { id: "user2" } };

			const key1 = keyGenerator(mockDirectiveArgs, null, {}, context1, mockInfo);
			const key2 = keyGenerator(mockDirectiveArgs, null, {}, context2, mockInfo);

			expect(key1).toBe("user:user1:Query.test");
			expect(key2).toBe("user:user2:Query.test");
			expect(key1).not.toBe(key2);
		});

		it("should include field name in key", () => {
			const keyGenerator = createUserKeyGenerator(getUserId);

			const context: UserContext = {
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
		it("should reject invalid callback input", () => {
			expect(() => createIPKeyGenerator("invalid" as unknown as never)).toThrow(
				"getIP must be a function",
			);
		});

		const getIP = (context: IPContext) => context.req?.ip;

		it("should generate key based on IP address", () => {
			const keyGenerator = createIPKeyGenerator(getIP);

			const context: IPContext = {
				req: { ip: "192.168.1.1" },
			};

			const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

			expect(key).toBe("ip:192.168.1.1:Query.test");
		});

		it("should use 'unknown' for missing IP", () => {
			const keyGenerator = createIPKeyGenerator(getIP);

			const context: IPContext = {};

			const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

			expect(key).toBe("ip:unknown:Query.test");
		});

		it("should use 'unknown' for null IP", () => {
			const keyGenerator = createIPKeyGenerator(getIP);

			const context: IPContext = {
				req: { ip: null },
			};

			const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

			expect(key).toBe("ip:unknown:Query.test");
		});

		it("should use 'unknown' for undefined IP", () => {
			const keyGenerator = createIPKeyGenerator(getIP);

			const context: IPContext = {
				req: { ip: undefined },
			};

			const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

			expect(key).toBe("ip:unknown:Query.test");
		});

		it("should generate different keys for different IPs", () => {
			const keyGenerator = createIPKeyGenerator(getIP);

			const context1: IPContext = { req: { ip: "192.168.1.1" } };
			const context2: IPContext = { req: { ip: "192.168.1.2" } };

			const key1 = keyGenerator(mockDirectiveArgs, null, {}, context1, mockInfo);
			const key2 = keyGenerator(mockDirectiveArgs, null, {}, context2, mockInfo);

			expect(key1).toBe("ip:192.168.1.1:Query.test");
			expect(key2).toBe("ip:192.168.1.2:Query.test");
			expect(key1).not.toBe(key2);
		});

		it("should handle x-forwarded-for header", () => {
			const keyGenerator = createIPKeyGenerator(
				(context: IPContext) => context.req?.ip || context.req?.headers?.["x-forwarded-for"],
			);

			const context: IPContext = {
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
			const keyGenerator = createIPKeyGenerator(getIP);

			const context: IPContext = {
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
		it("should reject invalid callback input", () => {
			expect(() => createCompositeKeyGenerator("invalid" as unknown as never)).toThrow(
				"getIdentifiers must be a function",
			);
		});

		it("should reject invalid callback return values", () => {
			const keyGenerator = createCompositeKeyGenerator(() => "invalid" as never);

			expect(() =>
				keyGenerator(mockDirectiveArgs, null, {}, {} as CompositeContext, mockInfo),
			).toThrow("getIdentifiers must return an object or an array of tuples");
		});

		it("should reject malformed tuple arrays", () => {
			const keyGenerator = createCompositeKeyGenerator(() => [["userId"]] as unknown as never);

			expect(() =>
				keyGenerator(mockDirectiveArgs, null, {}, {} as CompositeContext, mockInfo),
			).toThrow("tuple entries must be [key, value]");
		});

		it("should generate key based on multiple identifiers", () => {
			const getIdentifiers = (context: CompositeContext) => ({
				apiKey: context.apiKey,
				userId: context.user?.id,
			});
			const keyGenerator = createCompositeKeyGenerator(getIdentifiers);

			const context: CompositeContext = {
				apiKey: "key123",
				user: { id: "user123" },
			};

			const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

			expect(key).toBe("apiKey:key123:userId:user123:Query.test");
		});

		it("should filter out null identifiers", () => {
			const getIdentifiers = (context: CompositeContext) => ({
				apiKey: context.apiKey,
				userId: context.user?.id,
			});
			const keyGenerator = createCompositeKeyGenerator(getIdentifiers);

			const context: CompositeContext = {
				apiKey: "key123",
				user: { id: null },
			};

			const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

			expect(key).toBe("apiKey:key123:Query.test");
		});

		it("should filter out undefined identifiers", () => {
			const getIdentifiers = (context: CompositeContext) => ({
				apiKey: context.apiKey,
				userId: context.user?.id,
			});
			const keyGenerator = createCompositeKeyGenerator(getIdentifiers);

			const context: CompositeContext = {
				apiKey: "key123",
			};

			const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

			expect(key).toBe("apiKey:key123:Query.test");
		});

		it("should handle all null identifiers", () => {
			const getIdentifiers = (context: CompositeContext) => ({
				apiKey: context.apiKey,
				userId: context.user?.id,
			});
			const keyGenerator = createCompositeKeyGenerator(getIdentifiers);

			const context: CompositeContext = {};

			const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

			expect(key).toBe("anonymous:Query.test");
		});

		it("should maintain identifier order", () => {
			const getIdentifiers = (context: CompositeContext) => ({
				a: context.a,
				b: context.b,
				c: context.c,
			});
			const keyGenerator = createCompositeKeyGenerator(getIdentifiers);

			const context: CompositeContext = {
				a: "1",
				b: "2",
				c: "3",
			};

			const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

			expect(key).toBe("a:1:b:2:c:3:Query.test");
		});

		it("should support tuple form for explicit ordering", () => {
			const keyGenerator = createCompositeKeyGenerator((context: CompositeContext) => [
				["userId", context.user?.id],
				["apiKey", context.apiKey],
			]);

			const context: CompositeContext = {
				apiKey: "key123",
				user: { id: "user123" },
			};

			const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

			expect(key).toBe("userId:user123:apiKey:key123:Query.test");
		});

		it("should include field name in key", () => {
			const getIdentifiers = (context: CompositeContext) => ({
				userId: context.user?.id,
			});
			const keyGenerator = createCompositeKeyGenerator(getIdentifiers);

			const context: CompositeContext = {
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
			const getIdentifiers = (context: CompositeContext) => ({
				apiKey: context.apiKey,
				ip: context.req?.ip,
				userId: context.user?.id,
			});
			const keyGenerator = createCompositeKeyGenerator(getIdentifiers);

			const context: CompositeContext = {
				apiKey: "key123",
				req: { ip: "192.168.1.1" },
				user: { id: "user123" },
			};

			const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

			expect(key).toBe("apiKey:key123:ip:192.168.1.1:userId:user123:Query.test");
		});

		it("should generate different keys for different identifier values", () => {
			const getIdentifiers = (context: CompositeContext) => ({
				userId: context.user?.id,
			});
			const keyGenerator = createCompositeKeyGenerator(getIdentifiers);

			const context1: CompositeContext = { user: { id: "user1" } };
			const context2: CompositeContext = { user: { id: "user2" } };

			const key1 = keyGenerator(mockDirectiveArgs, null, {}, context1, mockInfo);
			const key2 = keyGenerator(mockDirectiveArgs, null, {}, context2, mockInfo);

			expect(key1).toBe("userId:user1:Query.test");
			expect(key2).toBe("userId:user2:Query.test");
			expect(key1).not.toBe(key2);
		});
	});

	describe("Edge Cases", () => {
		it("should truncate key parts exceeding 256 characters", () => {
			const longUserId = "a".repeat(300);
			const keyGenerator = createUserKeyGenerator<UserContext>((context) => context.user?.id);

			const key = keyGenerator(mockDirectiveArgs, null, {}, { user: { id: longUserId } }, mockInfo);

			expect(key).toBe(`user:${"a".repeat(256)}:Query.test`);
		});

		it("should treat whitespace-only identifiers as missing", () => {
			const keyGenerator = createUserKeyGenerator<UserContext>((context) => context.user?.id);

			const key = keyGenerator(mockDirectiveArgs, null, {}, { user: { id: "   " } }, mockInfo);

			expect(key).toBe("user:anonymous:Query.test");
		});
	});
});
