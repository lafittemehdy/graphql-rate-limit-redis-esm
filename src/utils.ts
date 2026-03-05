/**
 * Shared internal helpers used across modules.
 *
 * @internal
 */

/** Check whether a value is a non-null object (includes class instances and arrays). */
export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}
