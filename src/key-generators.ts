import type { GraphQLResolveInfo } from "graphql";
import {
	DEFAULT_IDENTITY,
	firstNormalizedValue,
	getForwardedForIP,
	normalizeIdentityLabel,
	normalizeKeyPart,
	readHeaderValue,
	readNestedValue,
	resolveCompositeIdentifierEntries,
	validateFactoryCallback,
	withFieldScope,
} from "./key-generator-internal.js";
import type { DefaultKeyGeneratorOptions, KeyGenerator, RateLimitDirectiveArgs } from "./types.js";

const TRUST_PROXY_DISABLED_MESSAGE =
	"Forwarded IP headers are ignored by default. Set trustProxy: true in createDefaultKeyGenerator options if your app runs behind a trusted proxy.";

interface ResolvedDefaultKeyGeneratorOptions {
	anonymousIdentity: string;
	includeApiKey: boolean;
	includeIP: boolean;
	includeUserId: boolean;
	trustProxy: boolean;
}

// ---------------------------------------------------------------------------
// Identity extraction
// ---------------------------------------------------------------------------

/**
 * Extracts API key identity from context.
 */
function getIdentityFromApiKey(context: unknown): string | null {
	const requestHeaders = readNestedValue(context, "req", "headers");
	const contextHeaders = readNestedValue(context, "headers");

	const apiKey = firstNormalizedValue([
		readNestedValue(context, "apiKey"),
		readHeaderValue(requestHeaders, "x-api-key"),
		readHeaderValue(contextHeaders, "x-api-key"),
	]);

	return apiKey ? `apiKey:${apiKey}` : null;
}

/**
 * Extracts IP identity from context.
 */
function getIdentityFromIP(
	context: unknown,
	options: ResolvedDefaultKeyGeneratorOptions,
): string | null {
	const requestIP = firstNormalizedValue([
		readNestedValue(context, "req", "ip"),
		readNestedValue(context, "ip"),
	]);

	if (requestIP) {
		return `ip:${requestIP}`;
	}

	if (!options.trustProxy) {
		return null;
	}

	const requestHeaders = readNestedValue(context, "req", "headers");
	const contextHeaders = readNestedValue(context, "headers");
	const forwardedFor = firstNormalizedValue([
		getForwardedForIP(requestHeaders),
		getForwardedForIP(contextHeaders),
	]);

	return forwardedFor ? `ip:${forwardedFor}` : null;
}

/**
 * Extracts user identity from context.
 */
function getIdentityFromUser(context: unknown): string | null {
	const userId = firstNormalizedValue([
		readNestedValue(context, "user", "id"),
		readNestedValue(context, "userId"),
	]);

	return userId ? `user:${userId}` : null;
}

/**
 * Builds a caller identity from context using configured identity sources.
 * Uses early returns to avoid unnecessary allocation.
 */
function getDefaultIdentityFromContext(
	context: unknown,
	options: ResolvedDefaultKeyGeneratorOptions,
): string {
	if (options.includeUserId) {
		const userId = getIdentityFromUser(context);
		if (userId) {
			return userId;
		}
	}

	if (options.includeIP) {
		const ip = getIdentityFromIP(context, options);
		if (ip) {
			return ip;
		}
	}

	if (options.includeApiKey) {
		const apiKey = getIdentityFromApiKey(context);
		if (apiKey) {
			return apiKey;
		}
	}

	return options.anonymousIdentity;
}

// ---------------------------------------------------------------------------
// Default key generator option validation
// ---------------------------------------------------------------------------

/**
 * Validates options passed to createDefaultKeyGenerator.
 */
function validateDefaultKeyGeneratorOptions(options: DefaultKeyGeneratorOptions | undefined): void {
	if (options === undefined) {
		return;
	}

	if (typeof options !== "object" || options === null || Array.isArray(options)) {
		throw new Error("Invalid createDefaultKeyGenerator options: options must be an object.");
	}

	const { anonymousIdentity, includeApiKey, includeIP, includeUserId, trustProxy } = options;

	if (anonymousIdentity !== undefined && typeof anonymousIdentity !== "string") {
		throw new Error(
			"Invalid createDefaultKeyGenerator options: anonymousIdentity must be a string.",
		);
	}

	if (includeApiKey !== undefined && typeof includeApiKey !== "boolean") {
		throw new Error("Invalid createDefaultKeyGenerator options: includeApiKey must be a boolean.");
	}

	if (includeIP !== undefined && typeof includeIP !== "boolean") {
		throw new Error("Invalid createDefaultKeyGenerator options: includeIP must be a boolean.");
	}

	if (includeUserId !== undefined && typeof includeUserId !== "boolean") {
		throw new Error("Invalid createDefaultKeyGenerator options: includeUserId must be a boolean.");
	}

	if (trustProxy !== undefined && typeof trustProxy !== "boolean") {
		throw new Error("Invalid createDefaultKeyGenerator options: trustProxy must be a boolean.");
	}

	if (trustProxy && includeIP === false) {
		throw new Error(
			"Invalid createDefaultKeyGenerator options: trustProxy requires includeIP to be enabled.",
		);
	}
}

/**
 * Resolves and validates default key generator options with defaults applied.
 */
function resolveDefaultKeyGeneratorOptions(
	options: DefaultKeyGeneratorOptions | undefined,
): ResolvedDefaultKeyGeneratorOptions {
	validateDefaultKeyGeneratorOptions(options);

	return {
		anonymousIdentity: normalizeIdentityLabel(options?.anonymousIdentity),
		includeApiKey: options?.includeApiKey ?? true,
		includeIP: options?.includeIP ?? true,
		includeUserId: options?.includeUserId ?? true,
		trustProxy: options?.trustProxy ?? false,
	};
}

// ---------------------------------------------------------------------------
// Key generator factories
// ---------------------------------------------------------------------------

/**
 * Creates a composite key generator that combines multiple identifiers.
 * Accepts either an object or an array of tuples for explicit ordering.
 *
 * @param getIdentifiers - Function to extract identifiers from context
 * @returns KeyGenerator function
 *
 * @example
 * ```typescript
 * // Object form (relies on insertion order)
 * const keyGenerator = createCompositeKeyGenerator(
 *   (context) => ({
 *     userId: context.user?.id,
 *     apiKey: context.apiKey,
 *   })
 * );
 *
 * // Tuple form (explicit ordering)
 * const keyGenerator = createCompositeKeyGenerator(
 *   (context) => [
 *     ["userId", context.user?.id],
 *     ["apiKey", context.apiKey],
 *   ]
 * );
 * ```
 */
export function createCompositeKeyGenerator<TContext = unknown>(
	getIdentifiers: (
		context: TContext,
	) =>
		| ReadonlyArray<readonly [string, string | null | undefined]>
		| Record<string, string | null | undefined>,
): KeyGenerator<TContext> {
	validateFactoryCallback(getIdentifiers, "createCompositeKeyGenerator", "getIdentifiers");

	return (
		_directiveArgs: RateLimitDirectiveArgs,
		_source: unknown,
		_args: Record<string, unknown>,
		context: TContext,
		info: GraphQLResolveInfo,
	) => {
		const entries = resolveCompositeIdentifierEntries(getIdentifiers(context));
		const identityParts: string[] = [];

		for (const [key, value] of entries) {
			const normalizedKey = normalizeKeyPart(key);
			const normalizedValue = normalizeKeyPart(value);

			if (!normalizedKey || !normalizedValue) {
				continue;
			}

			identityParts.push(`${normalizedKey}:${normalizedValue}`);
		}

		return withFieldScope(identityParts.join(":") || DEFAULT_IDENTITY, info);
	};
}

/**
 * Creates the built-in default key generator.
 *
 * By default, forwarded headers are NOT trusted.
 * For production, prefer a custom key generator tailored to your auth model.
 *
 * @param options - Configuration options for identity extraction
 * @returns KeyGenerator function
 *
 * @example
 * ```typescript
 * const keyGenerator = createDefaultKeyGenerator({
 *   trustProxy: true,
 *   includeUserId: true,
 *   includeIP: true,
 * });
 * ```
 */
export function createDefaultKeyGenerator<TContext = unknown>(
	options?: DefaultKeyGeneratorOptions,
): KeyGenerator<TContext> {
	const resolvedOptions = resolveDefaultKeyGeneratorOptions(options);

	return (
		_directiveArgs: RateLimitDirectiveArgs,
		_source: unknown,
		_args: Record<string, unknown>,
		context: TContext,
		info: GraphQLResolveInfo,
	) => {
		const identity = getDefaultIdentityFromContext(context, resolvedOptions);
		return withFieldScope(identity, info);
	};
}

/**
 * Creates a key generator that rate limits per IP address.
 *
 * @param getIP - Function to extract IP address from context
 * @returns KeyGenerator function
 *
 * @example
 * ```typescript
 * const keyGenerator = createIPKeyGenerator(
 *   (context) => context.req?.ip || 'unknown'
 * );
 * ```
 */
export function createIPKeyGenerator<TContext = unknown>(
	getIP: (context: TContext) => string | null | undefined,
): KeyGenerator<TContext> {
	validateFactoryCallback(getIP, "createIPKeyGenerator", "getIP");

	return (
		_directiveArgs: RateLimitDirectiveArgs,
		_source: unknown,
		_args: Record<string, unknown>,
		context: TContext,
		info: GraphQLResolveInfo,
	) => {
		const ip = normalizeKeyPart(getIP(context)) || "unknown";
		return withFieldScope(`ip:${ip}`, info);
	};
}

/**
 * Creates a key generator that rate limits per user ID.
 *
 * @param getUserId - Function to extract user ID from context
 * @returns KeyGenerator function
 *
 * @example
 * ```typescript
 * const keyGenerator = createUserKeyGenerator(
 *   (context) => context.user?.id || 'anonymous'
 * );
 * ```
 */
export function createUserKeyGenerator<TContext = unknown>(
	getUserId: (context: TContext) => string | null | undefined,
): KeyGenerator<TContext> {
	validateFactoryCallback(getUserId, "createUserKeyGenerator", "getUserId");

	return (
		_directiveArgs: RateLimitDirectiveArgs,
		_source: unknown,
		_args: Record<string, unknown>,
		context: TContext,
		info: GraphQLResolveInfo,
	) => {
		const userId = normalizeKeyPart(getUserId(context)) || DEFAULT_IDENTITY;
		return withFieldScope(`user:${userId}`, info);
	};
}

/**
 * Built-in default key generator with secure defaults.
 */
export const defaultKeyGenerator: KeyGenerator = createDefaultKeyGenerator();

/**
 * Guidance string for deployments that need trusted proxy behavior.
 */
export const trustProxyGuidance: string = TRUST_PROXY_DISABLED_MESSAGE;
