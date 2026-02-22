import type { GraphQLResolveInfo } from "graphql";
import type {
  DefaultKeyGeneratorOptions,
  KeyGenerator,
  RateLimitDirectiveArgs,
} from "./types.js";

const DEFAULT_IDENTITY = "anonymous";
const MAX_KEY_PART_LENGTH = 256;
const TRUST_PROXY_DISABLED_MESSAGE =
  "Forwarded IP headers are ignored by default. Set trustProxy: true in createDefaultKeyGenerator options if your app runs behind a trusted proxy.";

interface ResolvedDefaultKeyGeneratorOptions {
  anonymousIdentity: string;
  includeApiKey: boolean;
  includeIP: boolean;
  includeUserId: boolean;
  trustProxy: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Validates callback inputs for key generator factories.
 */
function validateFactoryCallback(
  value: unknown,
  factoryName: string,
  callbackName: string,
): void {
  if (typeof value !== "function") {
    throw new Error(
      `Invalid ${factoryName} argument: ${callbackName} must be a function.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Key part utilities
// ---------------------------------------------------------------------------

/**
 * Normalizes and bounds a key part for safe inclusion in rate limit keys.
 * Trims whitespace and enforces a maximum length.
 */
function normalizeKeyPart(value: unknown): string | null {
  if (value == null) {
    return null;
  }

  const normalized = String(value).trim();
  if (normalized.length === 0) {
    return null;
  }

  return normalized.length > MAX_KEY_PART_LENGTH
    ? normalized.slice(0, MAX_KEY_PART_LENGTH)
    : normalized;
}

/**
 * Returns the first non-empty normalized value from a candidate list.
 */
function firstNormalizedValue(values: readonly unknown[]): string | null {
  for (const value of values) {
    const normalized = normalizeKeyPart(value);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

/**
 * Normalizes an identity label, falling back to the default identity.
 */
function normalizeIdentityLabel(label: unknown): string {
  return normalizeKeyPart(label) ?? DEFAULT_IDENTITY;
}

/**
 * Appends GraphQL field scope to a key identity prefix.
 */
function withFieldScope(identity: string, info: GraphQLResolveInfo): string {
  return `${identity}:${info.parentType.name}.${info.fieldName}`;
}

// ---------------------------------------------------------------------------
// Context reading utilities
// ---------------------------------------------------------------------------

/**
 * Safely reads a nested property from an unknown object.
 */
function readNestedValue(target: unknown, ...path: string[]): unknown {
  let current: unknown = target;

  for (const segment of path) {
    if (!isRecord(current)) {
      return undefined;
    }

    current = current[segment];
  }

  return current;
}

/**
 * Reads the first present header value from a set of candidate names.
 */
function readHeaderValue(headers: unknown, ...headerNames: string[]): unknown {
  if (headers == null) {
    return undefined;
  }

  if (typeof Headers !== "undefined" && headers instanceof Headers) {
    for (const headerName of headerNames) {
      const value = headers.get(headerName);
      if (value !== null) {
        return value;
      }
    }

    return undefined;
  }

  if (!isRecord(headers)) {
    return undefined;
  }

  const headerMap = headers;

  // Fast path: exact match (covers Node.js-normalized lowercase headers)
  for (const headerName of headerNames) {
    const value = headerMap[headerName];
    if (value !== undefined) {
      return value;
    }
  }

  // Slow path: case-insensitive scan for non-normalized header maps
  const normalizedHeaderNames = new Set(
    headerNames.map((headerName) => headerName.toLowerCase()),
  );

  for (const [headerName, headerValue] of Object.entries(headerMap)) {
    if (normalizedHeaderNames.has(headerName.toLowerCase())) {
      return headerValue;
    }
  }

  return undefined;
}

/**
 * Extracts the first forwarded client IP from headers.
 */
function getForwardedForIP(headers: unknown): string | null {
  const rawHeaderValue = readHeaderValue(headers, "x-forwarded-for");

  const headerValue = Array.isArray(rawHeaderValue)
    ? rawHeaderValue[0]
    : rawHeaderValue;

  if (typeof headerValue !== "string") {
    return null;
  }

  const firstIP = headerValue.split(",")[0]?.trim();
  return firstIP && firstIP.length > 0 ? firstIP : null;
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
function validateDefaultKeyGeneratorOptions(
  options: DefaultKeyGeneratorOptions | undefined,
): void {
  if (options === undefined) {
    return;
  }

  if (
    typeof options !== "object" ||
    options === null ||
    Array.isArray(options)
  ) {
    throw new Error(
      "Invalid createDefaultKeyGenerator options: options must be an object.",
    );
  }

  const {
    anonymousIdentity,
    includeApiKey,
    includeIP,
    includeUserId,
    trustProxy,
  } = options;

  if (
    anonymousIdentity !== undefined &&
    typeof anonymousIdentity !== "string"
  ) {
    throw new Error(
      "Invalid createDefaultKeyGenerator options: anonymousIdentity must be a string.",
    );
  }

  if (includeApiKey !== undefined && typeof includeApiKey !== "boolean") {
    throw new Error(
      "Invalid createDefaultKeyGenerator options: includeApiKey must be a boolean.",
    );
  }

  if (includeIP !== undefined && typeof includeIP !== "boolean") {
    throw new Error(
      "Invalid createDefaultKeyGenerator options: includeIP must be a boolean.",
    );
  }

  if (includeUserId !== undefined && typeof includeUserId !== "boolean") {
    throw new Error(
      "Invalid createDefaultKeyGenerator options: includeUserId must be a boolean.",
    );
  }

  if (trustProxy !== undefined && typeof trustProxy !== "boolean") {
    throw new Error(
      "Invalid createDefaultKeyGenerator options: trustProxy must be a boolean.",
    );
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

type CompositeIdentifierEntry = readonly [unknown, unknown];

/**
 * Returns true when a value is a `[key, value]` tuple.
 */
function isCompositeIdentifierEntry(
  value: unknown,
): value is CompositeIdentifierEntry {
  return Array.isArray(value) && value.length === 2;
}

/**
 * Resolves composite key callback output into iterable key/value entries.
 */
function resolveCompositeIdentifierEntries(
  raw: unknown,
): ReadonlyArray<CompositeIdentifierEntry> {
  if (Array.isArray(raw)) {
    if (raw.some((entry) => !isCompositeIdentifierEntry(entry))) {
      throw new Error(
        "Invalid createCompositeKeyGenerator callback result: tuple entries must be [key, value].",
      );
    }

    return raw;
  }

  if (!isRecord(raw)) {
    throw new Error(
      "Invalid createCompositeKeyGenerator callback result: getIdentifiers must return an object or an array of tuples.",
    );
  }

  return Object.entries(raw);
}

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
  validateFactoryCallback(
    getIdentifiers,
    "createCompositeKeyGenerator",
    "getIdentifiers",
  );

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
