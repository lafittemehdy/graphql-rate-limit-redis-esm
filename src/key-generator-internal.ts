/** Provides canonical, bounded identity encoding for the public key-generator factories. */

/// <reference types="node" />

import { createHash } from "node:crypto";
import { isIP } from "node:net";
import type { GraphQLResolveInfo } from "graphql";
import { isRecord } from "./utils.js";

export const DEFAULT_IDENTITY = "anonymous";
export const MAX_KEY_PART_LENGTH = 256;
const HASHED_KEY_PART_PREFIX = "~sha256:";

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
 * Trims whitespace and fingerprints values that cannot fit the bounded literal domain.
 */
export function normalizeKeyPart(value: unknown): string | null {
	if (value == null) {
		return null;
	}

	if (typeof value !== "string") {
		throw new Error("Invalid key identity component: expected a string, null, or undefined.");
	}

	const normalized = value.trim();
	if (normalized.length === 0) {
		return null;
	}

	if (
		normalized.length > MAX_KEY_PART_LENGTH ||
		(normalized.startsWith("~") && normalized.length === MAX_KEY_PART_LENGTH)
	) {
		return fingerprintKeyPart(normalized);
	}

	// Escape the digest domain so a literal short value cannot equal a hashed value.
	return normalized.startsWith("~") ? `~${normalized}` : normalized;
}

/** Returns a deterministic, fixed-length fingerprint of a normalized key part. */
export function fingerprintKeyPart(value: string): string {
	// UTF-16LE preserves JavaScript code units, including lone surrogates, before hashing.
	const digest = createHash("sha256").update(value, "utf16le").digest("base64url");
	return `${HASHED_KEY_PART_PREFIX}${digest}`;
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

	const normalizedHeaderNames = new Set(headerNames.map((headerName) => headerName.toLowerCase()));
	const matches = Object.entries(headers).filter(([headerName]) =>
		normalizedHeaderNames.has(headerName.toLowerCase()),
	);

	// Multiple case variants are an ambiguous wire representation, even when one
	// happens to use Node's conventional lowercase spelling.
	return matches.length === 1 ? matches[0]?.[1] : undefined;
}

/** Returns whether a supported header container contains any candidate field. */
export function hasHeaderField(headers: unknown, ...headerNames: string[]): boolean {
	if (headers == null) {
		return false;
	}

	if (typeof Headers !== "undefined" && headers instanceof Headers) {
		for (const headerName of headerNames) {
			if (headers.has(headerName)) {
				return true;
			}
		}

		return false;
	}

	if (!isRecord(headers)) {
		return false;
	}

	const normalizedHeaderNames = new Set(headerNames.map((headerName) => headerName.toLowerCase()));
	for (const headerName of Object.keys(headers)) {
		if (normalizedHeaderNames.has(headerName.toLowerCase())) {
			return true;
		}
	}

	return false;
}

/**
 * Reads one unambiguous string header value.
 */
export function readSingleHeaderValue(headers: unknown, ...headerNames: string[]): string | null {
	const rawHeaderValue = readHeaderValue(headers, ...headerNames);
	if (typeof rawHeaderValue === "string") {
		return rawHeaderValue;
	}

	if (
		Array.isArray(rawHeaderValue) &&
		rawHeaderValue.length === 1 &&
		typeof rawHeaderValue[0] === "string"
	) {
		return rawHeaderValue[0];
	}

	return null;
}

/** Canonicalizes a syntactically valid IPv4 or IPv6 address. */
export function normalizeIPAddress(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}

	const candidate = value.trim();
	const family = isIP(candidate);
	if (family === 0) {
		return null;
	}

	if (family === 4) {
		return candidate;
	}

	const canonicalIPv6 = new URL(`http://[${candidate}]/`).hostname.slice(1, -1).toLowerCase();
	const mappedIPv4 = canonicalIPv6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
	if (!mappedIPv4) {
		return canonicalIPv6;
	}

	const high = Number.parseInt(mappedIPv4[1] ?? "", 16);
	const low = Number.parseInt(mappedIPv4[2] ?? "", 16);
	return `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`;
}

/**
 * Extracts the client IP preceding a configured number of trusted proxy hops.
 */
export function getForwardedForIP(headers: unknown, trustedProxyHops = 1): string | null {
	const headerValue = readSingleHeaderValue(headers, "x-forwarded-for");
	if (!headerValue || !Number.isInteger(trustedProxyHops) || trustedProxyHops <= 0) {
		return null;
	}

	const forwardedChain = headerValue.split(",");
	const clientIndex = forwardedChain.length - trustedProxyHops;
	if (clientIndex < 0) {
		return null;
	}

	return normalizeIPAddress(forwardedChain[clientIndex]);
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
