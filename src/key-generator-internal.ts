import type { GraphQLResolveInfo } from "graphql";
import { isRecord } from "./utils.js";

export const DEFAULT_IDENTITY = "anonymous";
export const MAX_KEY_PART_LENGTH = 256;

type CompositeIdentifierEntry = readonly [unknown, unknown];

/**
 * Validates callback inputs for key generator factories.
 */
export function validateFactoryCallback(
	value: unknown,
	factoryName: string,
	callbackName: string,
): void {
	if (typeof value !== "function") {
		throw new Error(`Invalid ${factoryName} argument: ${callbackName} must be a function.`);
	}
}

/**
 * Normalizes and bounds a key part for safe inclusion in rate limit keys.
 * Trims whitespace and enforces a maximum length.
 */
export function normalizeKeyPart(value: unknown): string | null {
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
export function firstNormalizedValue(values: readonly unknown[]): string | null {
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
export function normalizeIdentityLabel(label: unknown): string {
	return normalizeKeyPart(label) ?? DEFAULT_IDENTITY;
}

/**
 * Appends GraphQL field scope to a key identity prefix.
 */
export function withFieldScope(identity: string, info: GraphQLResolveInfo): string {
	return `${identity}:${info.parentType.name}.${info.fieldName}`;
}

/**
 * Safely reads a nested property from an unknown object.
 */
export function readNestedValue(target: unknown, ...path: string[]): unknown {
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
export function readHeaderValue(headers: unknown, ...headerNames: string[]): unknown {
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
	const normalizedHeaderNames = headerNames.map((headerName) => headerName.toLowerCase());

	for (const [headerName, headerValue] of Object.entries(headerMap)) {
		const normalizedName = headerName.toLowerCase();
		for (const candidate of normalizedHeaderNames) {
			if (candidate === normalizedName) {
				return headerValue;
			}
		}
	}

	return undefined;
}

/**
 * Extracts the first forwarded client IP from headers.
 */
export function getForwardedForIP(headers: unknown): string | null {
	const rawHeaderValue = readHeaderValue(headers, "x-forwarded-for");

	const headerValue = Array.isArray(rawHeaderValue) ? rawHeaderValue[0] : rawHeaderValue;
	if (typeof headerValue !== "string") {
		return null;
	}

	const firstIP = headerValue.split(",")[0]?.trim();
	return firstIP && firstIP.length > 0 ? firstIP : null;
}

/**
 * Resolves composite key callback output into iterable key/value entries.
 */
export function resolveCompositeIdentifierEntries(
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
 * Returns true when a value is a `[key, value]` tuple.
 */
function isCompositeIdentifierEntry(value: unknown): value is CompositeIdentifierEntry {
	return Array.isArray(value) && value.length === 2;
}
