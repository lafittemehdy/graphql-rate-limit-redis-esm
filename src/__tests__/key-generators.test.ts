/** Specifies identity precedence, secure encoding, and key-generator factory invariants. */

import { describe, expect, it, vi } from "vitest";

import { fingerprintKeyPart } from "../key-generator-internal.js";
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
		"x-api-key"?: string | string[];
	};
	req?: {
		headers?: {
			"x-forwarded-for"?: string | string[];
			"x-api-key"?: string | string[];
		};
		ip?: string | null;
		socket?: { remoteAddress?: string };
	};
	raw?: { socket?: { remoteAddress?: string } };
}

interface CompositeContext extends UserContext, IPContext {
	a?: string;
	apiKey?: string;
	b?: string;
	c?: string;
}

function expectedCompositeKey(
	entries: ReadonlyArray<readonly [string, string]>,
	fieldName = "test",
): string {
	return `composite:${fingerprintKeyPart(JSON.stringify(entries))}:Query.${fieldName}`;
}

describe("Key Generators", () => {
	describe("defaultKeyGenerator", () => {
		it("should generate anonymous key when context has no identity", () => {
			const key = defaultKeyGenerator(mockDirectiveArgs, null, {}, null, mockInfo);

			expect(key).toBe("anonymous:anonymous:Query.test");
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

		it("should ignore framework-derived ip when proxy trust is disabled", () => {
			const key = defaultKeyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{ req: { ip: "203.0.113.1" } },
				mockInfo,
			);

			expect(key).toBe("anonymous:anonymous:Query.test");
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

			expect(key).toBe("anonymous:anonymous:Query.test");
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

			expect(key).toBe(`apiKey:${fingerprintKeyPart("api-key-123")}:Query.test`);
			expect(key).not.toContain("api-key-123");
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

			expect(key1).toBe("anonymous:anonymous:Query.field1");
			expect(key2).toBe("anonymous:anonymous:Query.field2");
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

			expect(key1).toBe("anonymous:anonymous:Query.test");
			expect(key2).toBe("anonymous:anonymous:Mutation.test");
			expect(key1).not.toBe(key2);
		});
	});

	describe("createDefaultKeyGenerator", () => {
		it("should select the client preceding the trusted proxy hop", () => {
			const keyGenerator = createDefaultKeyGenerator({ trustProxy: true });
			const key = keyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{
					req: {
						headers: { "x-forwarded-for": "198.51.100.10, 198.51.100.11" },
					},
				},
				mockInfo,
			);

			expect(key).toBe("ip:198.51.100.11:Query.test");
		});

		it("should support an explicit trusted proxy hop count", () => {
			const keyGenerator = createDefaultKeyGenerator({ trustProxy: true, trustedProxyHops: 2 });
			const key = keyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{ req: { headers: { "x-forwarded-for": "198.51.100.10, 198.51.100.11" } } },
				mockInfo,
			);

			expect(key).toBe("ip:198.51.100.10:Query.test");
		});

		it("should use the direct request socket address without trusting forwarded headers", () => {
			const keyGenerator = createDefaultKeyGenerator();
			const key = keyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{
					req: {
						socket: { remoteAddress: "203.0.113.40" },
					},
				},
				mockInfo,
			);

			expect(key).toBe("ip:203.0.113.40:Query.test");
		});

		it("should use a direct raw socket address without trusting forwarded headers", () => {
			const keyGenerator = createDefaultKeyGenerator();
			const key = keyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{
					raw: {
						socket: { remoteAddress: "203.0.113.41" },
					},
				},
				mockInfo,
			);

			expect(key).toBe("ip:203.0.113.41:Query.test");
		});

		it("should canonicalize equivalent IPv6 socket addresses", () => {
			const keyGenerator = createDefaultKeyGenerator();
			const expanded = keyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{ req: { socket: { remoteAddress: "2001:0DB8:0:0:0:0:0:1" } } },
				mockInfo,
			);
			const compressed = keyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{ req: { socket: { remoteAddress: "2001:db8::1" } } },
				mockInfo,
			);

			expect(expanded).toBe("ip:2001:db8::1:Query.test");
			expect(compressed).toBe(expanded);
		});

		it("should canonicalize IPv4-mapped IPv6 socket addresses", () => {
			const keyGenerator = createDefaultKeyGenerator();
			const key = keyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{ req: { socket: { remoteAddress: "::ffff:192.0.2.128" } } },
				mockInfo,
			);

			expect(key).toBe("ip:192.0.2.128:Query.test");
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

			expect(key).toBe("ip:203.0.113.26:Query.test");
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

			expect(key).toBe(`apiKey:${fingerprintKeyPart("api-key-upper")}:Query.test`);
			expect(key).not.toContain("api-key-upper");
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

			expect(key).toBe(`apiKey:${fingerprintKeyPart("api-key-from-headers-object")}:Query.test`);
			expect(key).not.toContain("api-key-from-headers-object");
		});

		it("should reject ambiguous multi-valued API key headers", () => {
			const keyGenerator = createDefaultKeyGenerator();

			expect(() =>
				keyGenerator(
					mockDirectiveArgs,
					null,
					{},
					{ headers: { "x-api-key": ["valid-key", "attacker-controlled"] } },
					mockInfo,
				),
			).toThrow("x-api-key must contain one scalar value");
		});

		it("should reject case-duplicate API key properties", () => {
			const keyGenerator = createDefaultKeyGenerator();

			expect(() =>
				keyGenerator(
					mockDirectiveArgs,
					null,
					{},
					{
						headers: {
							"X-API-Key": "attacker-controlled",
							"x-api-key": "valid-key",
						},
					},
					mockInfo,
				),
			).toThrow("x-api-key must contain one scalar value");
		});

		it("should reject Fetch Headers that combine duplicate API keys", () => {
			const headers = new Headers();
			headers.append("x-api-key", "valid-key");
			headers.append("x-api-key", "attacker-controlled");
			const keyGenerator = createDefaultKeyGenerator();
			expect(() => keyGenerator(mockDirectiveArgs, null, {}, { headers }, mockInfo)).toThrow(
				"x-api-key must contain one non-empty scalar value",
			);
		});

		it("should reject non-scalar API keys from application context", () => {
			const keyGenerator = createDefaultKeyGenerator();

			expect(() =>
				keyGenerator(
					mockDirectiveArgs,
					null,
					{},
					{ apiKey: ["valid-key", "attacker-controlled"] },
					mockInfo,
				),
			).toThrow("context.apiKey must be a string when present");
		});

		it("should reject present but empty API key identities", () => {
			const keyGenerator = createDefaultKeyGenerator();

			expect(() => keyGenerator(mockDirectiveArgs, null, {}, { apiKey: "   " }, mockInfo)).toThrow(
				"context.apiKey must be non-empty when present",
			);
		});

		it("should read and fingerprint API keys from Fetch Request context", () => {
			const rawApiKey = "fetch-request-secret";
			const keyGenerator = createDefaultKeyGenerator();
			const key = keyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{
					request: new Request("https://example.test/graphql", {
						headers: { "x-api-key": rawApiKey },
					}),
				},
				mockInfo,
			);

			expect(key).toBe(`apiKey:${fingerprintKeyPart(rawApiKey)}:Query.test`);
			expect(key).not.toContain(rawApiKey);
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

			expect(key).toBe("ip:198.51.100.21:Query.test");
		});

		it("should read forwarded-for from Fetch Request context when trustProxy is enabled", () => {
			const keyGenerator = createDefaultKeyGenerator({ trustProxy: true });
			const key = keyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{
					request: new Request("https://example.test/graphql", {
						headers: { "x-forwarded-for": "198.51.100.30, 198.51.100.31" },
					}),
				},
				mockInfo,
			);

			expect(key).toBe("ip:198.51.100.31:Query.test");
		});

		it("should reject ambiguous duplicate forwarded headers", () => {
			const keyGenerator = createDefaultKeyGenerator({ trustProxy: true });
			const key = keyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{
					req: {
						headers: { "x-forwarded-for": ["198.51.100.10", "198.51.100.11"] },
						socket: { remoteAddress: "203.0.113.50" },
					},
				},
				mockInfo,
			);

			expect(key).toBe("ip:203.0.113.50:Query.test");
		});

		it("should reject case-duplicate forwarded properties", () => {
			const keyGenerator = createDefaultKeyGenerator({ trustProxy: true });
			const key = keyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{
					req: {
						headers: {
							"X-Forwarded-For": "198.51.100.10",
							"x-forwarded-for": "198.51.100.11",
						},
						socket: { remoteAddress: "203.0.113.52" },
					},
				},
				mockInfo,
			);

			expect(key).toBe("ip:203.0.113.52:Query.test");
		});

		it("should reject invalid forwarded identities and use the transport peer", () => {
			const keyGenerator = createDefaultKeyGenerator({ trustProxy: true });
			const key = keyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{
					req: {
						headers: { "x-forwarded-for": "attacker-controlled" },
						socket: { remoteAddress: "203.0.113.51" },
					},
				},
				mockInfo,
			);

			expect(key).toBe("ip:203.0.113.51:Query.test");
		});

		it("should use the transport peer when the trusted-hop chain is too short", () => {
			const keyGenerator = createDefaultKeyGenerator({ trustProxy: true, trustedProxyHops: 2 });
			const key = keyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{
					req: {
						headers: { "x-forwarded-for": "198.51.100.99" },
						ip: "198.51.100.99",
						socket: { remoteAddress: "203.0.113.53" },
					},
				},
				mockInfo,
			);

			expect(key).toBe("ip:203.0.113.53:Query.test");
		});

		it("should reject non-string user identities without invoking coercion", () => {
			const coercionSpy = vi.fn(() => "spoofed-user");
			const keyGenerator = createDefaultKeyGenerator();

			expect(() =>
				keyGenerator(
					mockDirectiveArgs,
					null,
					{},
					{ user: { id: { toString: coercionSpy } } } as unknown as UserContext,
					mockInfo,
				),
			).toThrow("Invalid key identity component");
			expect(coercionSpy).not.toHaveBeenCalled();
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

		it("should reject invalid trusted proxy hop counts", () => {
			expect(() => createDefaultKeyGenerator({ trustProxy: true, trustedProxyHops: 0 })).toThrow(
				"trustedProxyHops must be a positive integer",
			);
			expect(() => createDefaultKeyGenerator({ trustedProxyHops: 1 })).toThrow(
				"trustedProxyHops requires trustProxy to be enabled",
			);
		});

		it("should keep anonymous and authenticated identity variants disjoint", () => {
			const keyGenerator = createDefaultKeyGenerator({ anonymousIdentity: "user:victim" });
			const anonymousKey = keyGenerator(mockDirectiveArgs, null, {}, {}, mockInfo);
			const victimKey = keyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{ user: { id: "victim" } },
				mockInfo,
			);

			expect(anonymousKey).toBe("anonymous:user:victim:Query.test");
			expect(victimKey).toBe("user:victim:Query.test");
			expect(anonymousKey).not.toBe(victimKey);
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

			expect(key).toBe("anonymous:user:Query.test");
		});

		it("should use 'anonymous' for null user ID", () => {
			const keyGenerator = createUserKeyGenerator(getUserId);

			const context: UserContext = {
				user: { id: null },
			};

			const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

			expect(key).toBe("anonymous:user:Query.test");
		});

		it("should use 'anonymous' for undefined user ID", () => {
			const keyGenerator = createUserKeyGenerator(getUserId);

			const context: UserContext = {
				user: { id: undefined },
			};

			const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

			expect(key).toBe("anonymous:user:Query.test");
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

			expect(key).toBe("anonymous:ip:Query.test");
		});

		it("should use 'unknown' for null IP", () => {
			const keyGenerator = createIPKeyGenerator(getIP);

			const context: IPContext = {
				req: { ip: null },
			};

			const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

			expect(key).toBe("anonymous:ip:Query.test");
		});

		it("should use 'unknown' for undefined IP", () => {
			const keyGenerator = createIPKeyGenerator(getIP);

			const context: IPContext = {
				req: { ip: undefined },
			};

			const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

			expect(key).toBe("anonymous:ip:Query.test");
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

		it("should reject non-string components without invoking coercion", () => {
			const coercionSpy = vi.fn(() => "spoofed-component");
			const keyGenerator = createCompositeKeyGenerator(
				() => ({ userId: { toString: coercionSpy } }) as unknown as Record<string, string>,
			);

			expect(() =>
				keyGenerator(mockDirectiveArgs, null, {}, {} as CompositeContext, mockInfo),
			).toThrow("Invalid key identity component");
			expect(coercionSpy).not.toHaveBeenCalled();
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

			expect(key).toBe(
				expectedCompositeKey([
					["apiKey", "key123"],
					["userId", "user123"],
				]),
			);
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

			expect(key).toBe(expectedCompositeKey([["apiKey", "key123"]]));
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

			expect(key).toBe(expectedCompositeKey([["apiKey", "key123"]]));
		});

		it("should handle all null identifiers", () => {
			const getIdentifiers = (context: CompositeContext) => ({
				apiKey: context.apiKey,
				userId: context.user?.id,
			});
			const keyGenerator = createCompositeKeyGenerator(getIdentifiers);

			const context: CompositeContext = {};

			const key = keyGenerator(mockDirectiveArgs, null, {}, context, mockInfo);

			expect(key).toBe(expectedCompositeKey([]));
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

			expect(key).toBe(
				expectedCompositeKey([
					["a", "1"],
					["b", "2"],
					["c", "3"],
				]),
			);
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

			expect(key).toBe(
				expectedCompositeKey([
					["userId", "user123"],
					["apiKey", "key123"],
				]),
			);
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

			expect(key1).toBe(expectedCompositeKey([["userId", "user123"]], "field1"));
			expect(key2).toBe(expectedCompositeKey([["userId", "user123"]], "field2"));
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

			expect(key).toBe(
				expectedCompositeKey([
					["apiKey", "key123"],
					["ip", "192.168.1.1"],
					["userId", "user123"],
				]),
			);
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

			expect(key1).toBe(expectedCompositeKey([["userId", "user1"]]));
			expect(key2).toBe(expectedCompositeKey([["userId", "user2"]]));
			expect(key1).not.toBe(key2);
		});

		it("should distinguish delimiter-bearing identifier tuples", () => {
			const keyGenerator = createCompositeKeyGenerator((context: CompositeContext) => [
				["a", context.a],
				["c", context.b],
			]);

			const key1 = keyGenerator(mockDirectiveArgs, null, {}, { a: "b:c:d", b: "e" }, mockInfo);
			const key2 = keyGenerator(mockDirectiveArgs, null, {}, { a: "b", b: "d:c:e" }, mockInfo);

			expect(key1).not.toBe(key2);
		});
	});

	describe("Edge Cases", () => {
		it("should fingerprint key parts exceeding 256 characters without prefix collisions", () => {
			const longUserId = "a".repeat(300);
			const distinctLongUserId = `${"a".repeat(299)}b`;
			const keyGenerator = createUserKeyGenerator<UserContext>((context) => context.user?.id);

			const key1 = keyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{ user: { id: longUserId } },
				mockInfo,
			);
			const key1Again = keyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{ user: { id: longUserId } },
				mockInfo,
			);
			const key2 = keyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{ user: { id: distinctLongUserId } },
				mockInfo,
			);

			expect(key1).toBe(key1Again);
			expect(key1).not.toBe(key2);
			expect(key1).not.toContain(longUserId);
			expect(key1).toMatch(/^user:~sha256:[A-Za-z0-9_-]{43}:Query\.test$/);
		});

		it("should separate literal values from the fingerprint representation domain", () => {
			const longUserId = "a".repeat(300);
			const digestShapedUserId = fingerprintKeyPart(longUserId);
			const keyGenerator = createUserKeyGenerator<UserContext>((context) => context.user?.id);

			const hashedKey = keyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{ user: { id: longUserId } },
				mockInfo,
			);
			const literalKey = keyGenerator(
				mockDirectiveArgs,
				null,
				{},
				{ user: { id: digestShapedUserId } },
				mockInfo,
			);

			expect(hashedKey).not.toBe(literalKey);
			expect(literalKey).toBe(`user:~${digestShapedUserId}:Query.test`);
		});

		it("should treat whitespace-only identifiers as missing", () => {
			const keyGenerator = createUserKeyGenerator<UserContext>((context) => context.user?.id);

			const key = keyGenerator(mockDirectiveArgs, null, {}, { user: { id: "   " } }, mockInfo);

			expect(key).toBe("anonymous:user:Query.test");
		});
	});
});
