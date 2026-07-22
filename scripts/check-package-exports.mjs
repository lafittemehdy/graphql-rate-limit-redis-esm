/** Validates that package self-references select the intended ESM and CommonJS artifacts. */

import { createRequire } from "node:module";

const packageName = "graphql-rate-limit-redis-esm";
const requiredRuntimeExports = [
	"ERROR_CODES",
	"createCompositeKeyGenerator",
	"createDefaultKeyGenerator",
	"createIPKeyGenerator",
	"createRateLimitDirective",
	"createRateLimitedError",
	"createRateLimitKeyError",
	"createRateLimitServiceError",
	"createUserKeyGenerator",
	"defaultKeyGenerator",
	"isRateLimitRejection",
	"rateLimitDirectiveTypeDefs",
	"toRetryAfterSeconds",
	"trustProxyGuidance",
];

const require = createRequire(import.meta.url);
const esmEntry = import.meta.resolve(packageName);
const cjsEntry = require.resolve(packageName).replaceAll("\\", "/");

if (!esmEntry.endsWith("/dist/index.js")) {
	throw new Error(`ESM self-reference resolved to an unexpected artifact: ${esmEntry}`);
}

if (!cjsEntry.endsWith("/dist/index.cjs")) {
	throw new Error(`CommonJS self-reference resolved to an unexpected artifact: ${cjsEntry}`);
}

const esmNamespace = await import(packageName);
const cjsNamespace = require(packageName);

for (const exportName of requiredRuntimeExports) {
	if (!Object.hasOwn(esmNamespace, exportName)) {
		throw new Error(`ESM artifact is missing runtime export: ${exportName}`);
	}

	if (!Object.hasOwn(cjsNamespace, exportName)) {
		throw new Error(`CommonJS artifact is missing runtime export: ${exportName}`);
	}
}
