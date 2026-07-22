# graphql-rate-limit-redis-esm

[![CI](https://github.com/lafittemehdy/graphql-rate-limit-redis-esm/actions/workflows/ci.yml/badge.svg)](https://github.com/lafittemehdy/graphql-rate-limit-redis-esm/actions/workflows/ci.yml)
[![Publish](https://github.com/lafittemehdy/graphql-rate-limit-redis-esm/actions/workflows/publish.yml/badge.svg)](https://github.com/lafittemehdy/graphql-rate-limit-redis-esm/actions/workflows/publish.yml)
[![Pages](https://github.com/lafittemehdy/graphql-rate-limit-redis-esm/actions/workflows/pages.yml/badge.svg)](https://github.com/lafittemehdy/graphql-rate-limit-redis-esm/actions/workflows/pages.yml)
[![npm version](https://img.shields.io/npm/v/graphql-rate-limit-redis-esm?logo=npm)](https://www.npmjs.com/package/graphql-rate-limit-redis-esm)
[![npm downloads](https://img.shields.io/npm/dm/graphql-rate-limit-redis-esm?logo=npm)](https://www.npmjs.com/package/graphql-rate-limit-redis-esm)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node >=22.13](https://img.shields.io/badge/node-%3E%3D22.13-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![Provenance](https://img.shields.io/badge/provenance-verified-brightgreen?logo=npm)](https://www.npmjs.com/package/graphql-rate-limit-redis-esm)

Production-ready GraphQL rate limiting directive for Redis with ESM support.

## Interactive Demo

**[Try it live](https://lafittemehdy.github.io/graphql-rate-limit-redis-esm/)** or run locally:

```bash
cd examples/visualization
npm install
npm run dev
```

Scenario presets (normal flow, burst attack, Redis outage), a request pipeline flow diagram, a bucket gauge, and a response trace log.

## What it is
`graphql-rate-limit-redis-esm` is an ESM GraphQL schema transformer that applies a `@rateLimit(limit: Int!, duration: Int!)` directive to field resolvers.

At runtime, each decorated field calls a limiter instance (`consume(key)`) before resolver execution. The package also exports key-generator factories, standardized GraphQL error helpers, and TypeScript types.

## Key capabilities
- GraphQL directive SDL export: `rateLimitDirectiveTypeDefs`.
- Directive transformer factory: `createRateLimitDirective(config)`.
- Schema-time validation of directive arguments and runtime limits.
- Limiter instance reuse per unique `(limit, duration)` pair, with a configurable cache-size ceiling.
- Custom key generator support (sync or async).
- Built-in key generator helpers: default, user, IP, and composite.
- Service failure modes: `failClosed` (default) or `failOpen`.
- Standardized GraphQL error responses for rate-limit, key-generation, and limiter-service failures.
- ESM package output with exported TypeScript types.

## Installation

### Requirements

- Node.js `>=22.13.0` (from `engines`).
- Peer dependencies:
  - `graphql` `^16.0.0 || ^17.0.0`
  - `@graphql-tools/utils` `^10.0.0 || ^11.0.0`
  - `rate-limiter-flexible` `^8.0.0 || ^9.0.0 || ^10.0.0 || ^11.0.0`

If you use `RateLimiterRedis`, you also need a Redis client (for example `ioredis`) and a reachable Redis server.

```bash
npm install graphql-rate-limit-redis-esm graphql @graphql-tools/utils @graphql-tools/schema rate-limiter-flexible ioredis
```

```bash
pnpm add graphql-rate-limit-redis-esm graphql @graphql-tools/utils @graphql-tools/schema rate-limiter-flexible ioredis
```

```bash
yarn add graphql-rate-limit-redis-esm graphql @graphql-tools/utils @graphql-tools/schema rate-limiter-flexible ioredis
```

## Quickstart

```ts
import { makeExecutableSchema } from "@graphql-tools/schema";
import { Redis } from "ioredis";
import { RateLimiterRedis } from "rate-limiter-flexible";
import {
  createRateLimitDirective,
  rateLimitDirectiveTypeDefs,
} from "graphql-rate-limit-redis-esm";

const redis = new Redis("redis://localhost:6379", {
  commandTimeout: 5_000,
  connectTimeout: 5_000,
  enableOfflineQueue: false,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
});

await redis.connect();
await redis.ping();

const transformRateLimit = createRateLimitDirective({
  limiterClass: RateLimiterRedis,
  limiterOptions: {
    keyPrefix: "my-graphql-api",
    rejectIfRedisNotReady: true,
    storeClient: redis,
  },
});

const schema = makeExecutableSchema({
  typeDefs: `
    ${rateLimitDirectiveTypeDefs}
    type Query {
      login: String! @rateLimit(limit: 5, duration: 60)
    }
  `,
  resolvers: {
    Query: {
      login: () => "ok",
    },
  },
});

const schemaWithRateLimit = transformRateLimit(schema);
```

If you do not pass `keyGenerator`, the built-in default key generator is used.

## Migrating from 3.x

Version 4 introduces the versioned Redis identity protocol `rateLimit:v2`. It isolates distinct directive policies, fingerprints API/composite identities, canonically encodes long values and IP addresses, and gives anonymous variants disjoint tags. These corrections intentionally change stored Redis keys.

- Deploy 3.x and 4.x with a coordinated cutover. A mixed-major fleet uses independent counters and can temporarily admit more requests than one global quota permits.
- For blue/green deployment, use distinct application `keyPrefix` values and move traffic completely to the 4.x fleet rather than splitting one caller population across both versions.
- Old keys require no destructive migration; they expire according to their existing limiter TTLs.
- Forwarded-client selection now counts trusted hops from the right. Configure `trustedProxyHops` for proxy chains longer than one hop.

## Configuration

### `createRateLimitDirective(config)`

| Field | Required | Default | Notes |
| --- | --- | --- | --- |
| `limiterClass` | Yes | None | Must be a constructor that returns an object with `consume(key): Promise<unknown>`. |
| `limiterOptions` | Yes | None | Must include `storeClient`; set an application-specific `keyPrefix` to isolate deployments. `points` and `duration` are injected from the directive. |
| `keyGenerator` | No | `createDefaultKeyGenerator(defaultKeyGeneratorOptions)` | Signature: `(directiveArgs, source, args, context, info) => string \| Promise<string>`. |
| `defaultKeyGeneratorOptions` | No | See below | Used only when `keyGenerator` is not provided. |
| `runtimeLimits` | No | See below | Validates bounds for directive args and limiter/key internals. |
| `serviceErrorMode` | No | `"failClosed"` | `"failClosed"` throws service error on limiter backend failures; `"failOpen"` executes resolver instead. |

### Directive arguments
- `@rateLimit(limit: Int!, duration: Int!)`
- Both `limit` and `duration` must be positive integers.
- Default upper bounds:
  - `maxLimit`: `1_000_000`
  - `maxDurationSeconds`: `31_536_000`

### `runtimeLimits` defaults
- `maxDurationSeconds`: `31_536_000`
- `maxLimit`: `1_000_000`
- `maxKeyLength`: `512`
- `maxLimiterCacheSize`: `10_000`

### `defaultKeyGeneratorOptions` defaults
- `anonymousIdentity`: `"anonymous"`
- `includeUserId`: `true`
- `includeIP`: `true`
- `includeApiKey`: `true`
- `trustProxy`: `false`
- `trustedProxyHops`: `1` (used only when `trustProxy` is `true`)

`trustProxy: true` requires `includeIP !== false`. Supplying `trustedProxyHops` requires `trustProxy: true`.

### Built-in default key generator behavior

Identity priority order:
1. User: `context.user.id` or `context.userId`
2. IP: a canonical direct Node socket address; with `trustProxy: true`, a validated forwarded address with the direct transport peer as the only fallback
3. API key: `context.apiKey` or header `x-api-key` (stored as a SHA-256 fingerprint, never verbatim)
4. Fallback: the tagged `anonymousIdentity` variant (default `"anonymous"`)

Notes:
- Every key includes field scope suffix: `:<ParentType>.<fieldName>`.
- The directive adds the versioned `rateLimit:v2:(limit, duration)` namespace before consumption, preventing unequal policies from sharing Redis counters.
- `x-forwarded-for` is used only when `trustProxy: true`; the client preceding `trustedProxyHops` is selected from the right.
- Header reads support plain objects, `Headers`, and Fetch-style `context.request.headers`, case-insensitively. Ambiguous multi-valued credential/forwarding headers are rejected.
- A present but malformed or ambiguous API-key identity fails closed with `RATE_LIMIT_KEY_ERROR`; it never receives an additional anonymous quota bucket.
- Composite identities use an unambiguous normalized tuple serialization followed by a fixed-length, collision-resistant SHA-256 fingerprint.
- Identity components must be strings, `null`, or `undefined`; malformed runtime values are rejected without invoking user-defined coercion.

## Usage
### Public exports
- Constants:
  - `ERROR_CODES` — frozen object with `RATE_LIMITED`, `RATE_LIMIT_KEY_ERROR`, `RATE_LIMIT_SERVICE_ERROR`
- Directive:
  - `createRateLimitDirective`
  - `rateLimitDirectiveTypeDefs`
- Key generators:
  - `createDefaultKeyGenerator`
  - `defaultKeyGenerator`
  - `createUserKeyGenerator`
  - `createIPKeyGenerator`
  - `createCompositeKeyGenerator`
  - `trustProxyGuidance`
- Error helpers:
  - `createRateLimitedError`
  - `createRateLimitKeyError`
  - `createRateLimitServiceError`
  - `isRateLimitRejection`
  - `toRetryAfterSeconds`
- Types:
  - `DefaultKeyGeneratorOptions`
  - `KeyGenerator`
  - `RateLimitDirectiveArgs`
  - `RateLimitDirectiveConfig`
  - `RateLimiterClass`
  - `RateLimiterInstance`
  - `RateLimiterOptions`
  - `RateLimitRuntimeLimits`
  - `RateLimitServiceErrorMode`
  - `SchemaTransformer`

### Error semantics
| Condition | Error message | `extensions.code` | `extensions.http.status` | Extra fields |
| --- | --- | --- | --- | --- |
| Limiter rejection with `msBeforeNext` | `Rate limit exceeded` | `RATE_LIMITED` | `429` | `retryAfter` (seconds, minimum `1`) |
| Key generation throws or returns invalid key | `Rate limiting key generation failed` | `RATE_LIMIT_KEY_ERROR` | `500` | None |
| Limiter backend failure (non-rate-limit error) in `failClosed` mode | `Rate limiting service unavailable` | `RATE_LIMIT_SERVICE_ERROR` | `503` | None |

### Key generator examples

```ts
import {
  createCompositeKeyGenerator,
  createIPKeyGenerator,
  createUserKeyGenerator,
} from "graphql-rate-limit-redis-esm";

interface AppContext {
  apiKey?: string;
  req?: { ip?: string };
  user?: { id?: string };
}

const byUser = createUserKeyGenerator<AppContext>((ctx) => ctx.user?.id);
const byIp = createIPKeyGenerator<AppContext>((ctx) => ctx.req?.ip);
const composite = createCompositeKeyGenerator<AppContext>((ctx) => [
  ["userId", ctx.user?.id],
  ["apiKey", ctx.apiKey],
]);
```

### Environment variables
The runtime library does not require specific environment variables.

Repository-supported env vars:
- Benchmark script (`src/bench.ts`):
  - `BENCH_ITERATIONS` (default `5000`)
  - `BENCH_WARMUP` (default `1000`)
  - `BENCH_ROUNDS` (default `3`)
- Redis integration test (`src/__tests__/redis.integration.test.ts`):
  - `REDIS_URL` (the Redis integration suite runs only when this variable is set)

No end-user CLI is implemented. Benchmarks are run through package scripts.

## Scripts

From `package.json`:

| Script | Command |
| --- | --- |
| `pnpm run build` | `tsup` |
| `pnpm run check:consumers` | Strict ESM and CommonJS declaration-consumer compilation |
| `pnpm run check:examples` | Strict server-example compilation |
| `pnpm run check:package` | Runtime export verification + package dry run |
| `pnpm run dev` | TypeScript watch mode |
| `pnpm run lint` | Biome + library/example type checks + workflow invariants |
| `pnpm run lint:fix` | Biome autofix + library/example type checks |
| `pnpm test` | `vitest run` |
| `pnpm run test:watch` | `vitest` |
| `pnpm run test:ui` | `vitest --ui` |
| `pnpm run test:coverage` | `vitest run --coverage` |
| `pnpm run benchmark` | `tsx src/bench.ts` |
| `pnpm run verify` | Full lint, build, consumer, coverage, and package gate |
| `pnpm run prepublishOnly` | Full `verify` gate for manual publishes |

## Architecture
- `src/index.ts`: public export surface.
- `src/constants.ts`: `ERROR_CODES` frozen object.
- `src/directive.ts`: directive SDL, transformer, limiter instantiation/cache, and resolver wrapping.
- `src/directive-validation.ts`: configuration, directive-argument, key, and runtime-limit validation.
- `src/key-generators.ts`: default and factory key-generator policies.
- `src/key-generator-internal.ts`: bounded encoding, IP/header normalization, and composite-entry parsing.
- `src/errors.ts`: GraphQL error factories and retry-after conversion.
- `src/types.ts`: public TypeScript interfaces and type aliases.
- `src/bench.ts`: benchmark harness.
- `src/__tests__/`: unit and Redis-backed integration tests.
- `examples/visualization/src/`: interactive React rate-limiting demo.

## Performance

The directive overhead is measured separately from Redis I/O to isolate the cost of key generation, directive processing, and schema transformation.

The benchmark suite covers 7 scenarios across two categories:

| Category | Scenario | What it measures |
|---|---|---|
| **Key generation** | Default (user ID) | Baseline key extraction from context |
| **Key generation** | Trusted proxy | IP extraction from `x-forwarded-for` headers |
| **Key generation** | User factory | Custom user-based key generator |
| **Key generation** | Composite factory | Multi-field key composition |
| **GraphQL execution** | Baseline (no directive) | Pure GraphQL overhead (reference point) |
| **GraphQL execution** | Rate limit (default keygen) | Full directive + default key generation |
| **GraphQL execution** | Rate limit (async keygen) | Full directive + async key generation |

Run benchmarks locally:

```bash
pnpm run benchmark
```

Configure via environment variables: `BENCH_ITERATIONS` (default 5000), `BENCH_WARMUP` (default 1000), `BENCH_ROUNDS` (default 3).

## Troubleshooting
- Schema build throws `Invalid rate limit` or `Invalid duration`.
  - Cause: directive values are non-positive integers or exceed runtime limits.
  - Fix: use valid positive integers and/or adjust `runtimeLimits`.
- Schema build throws `Limiter cache size exceeded (...)`.
  - Cause: too many unique `(limit, duration)` combinations across decorated fields.
  - Fix: reduce unique combinations or increase `runtimeLimits.maxLimiterCacheSize`.
- Requests fail with `RATE_LIMIT_KEY_ERROR`.
  - Cause: key generator threw, returned empty/whitespace, returned a key with leading/trailing whitespace or control characters, or returned a key longer than `maxKeyLength` (default `512`).
  - Fix: return a trimmed, non-empty printable string key and keep it within length bounds.
- Requests fail with `RATE_LIMIT_SERVICE_ERROR`.
  - Cause: limiter backend threw a non-rate-limit error (for example Redis unavailable) and mode is `failClosed`.
  - Fix: restore backend connectivity or set `serviceErrorMode: "failOpen"` if availability-first behavior is acceptable. Configure bounded Redis retries and disable its offline queue; the mode cannot classify an operation that remains pending forever.
- `x-forwarded-for` appears ignored.
  - Cause: default key generator does not trust forwarded headers unless `trustProxy: true`.
  - Fix: enable `trustProxy: true` only behind trusted proxies.

## Contributing / Development notes
- Minimum Node version is `22.13`.
- Typical local workflow:
  - `pnpm install`
  - `pnpm run lint`
  - `pnpm run build`
  - `pnpm test`
- Redis integration test behavior:
  - Set `REDIS_URL` to run Redis-backed integration tests.
  - Without `REDIS_URL`, the `Redis Integration` test suite is skipped.
- Coverage thresholds (enforced by `vitest run --coverage`):
  | Metric | Threshold |
  | --- | --- |
  | Branches | 85% |
  | Functions | 100% |
  | Lines | 93% |
  | Statements | 93% |

## Code <-> Docs mapping
| Section / claim | Source files |
| --- | --- |
| What the package exports and how consumers import it | `src/index.ts`, `package.json` |
| Directive signature, transformer behavior, and service error mode | `src/directive.ts`, `src/types.ts` |
| Configuration validation and runtime limits | `src/directive-validation.ts`, `src/types.ts`, `src/__tests__/directive.test.ts` |
| Default identity order, proxy behavior, header extraction, and key factories | `src/key-generators.ts`, `src/key-generator-internal.ts`, `src/__tests__/key-generators.test.ts` |
| Error messages/codes/status fields and retry-after calculation | `src/constants.ts`, `src/errors.ts`, `src/__tests__/errors.test.ts`, `src/__tests__/directive.test.ts` |
| Node/peer requirements and package metadata | `package.json` |
| Repository scripts and benchmark execution | `package.json`, `src/bench.ts`, `tsconfig.json` |
| Benchmark/test environment variables | `src/bench.ts`, `src/__tests__/redis.integration.test.ts`, `.github/workflows/ci.yml` |
| Repository module layout and visualization artifact | `src/index.ts`, `src/constants.ts`, `src/directive.ts`, `src/directive-validation.ts`, `src/key-generators.ts`, `src/key-generator-internal.ts`, `src/errors.ts`, `src/types.ts`, `src/bench.ts`, `src/__tests__/`, `examples/visualization/src/` |

## Related Packages

This package is part of a suite of GraphQL security tools that work independently or together to protect your API:

| Package | Purpose |
|---|---|
| [`graphql-query-depth-limit-esm`](https://github.com/lafittemehdy/graphql-query-depth-limit-esm) | Depth limiting — reject deeply nested queries before execution |
| [`graphql-query-complexity-esm`](https://github.com/lafittemehdy/graphql-query-complexity-esm) | Complexity analysis — assign cost scores to fields and reject expensive queries |

**Recommended layering:** Use depth limiting as a fast, cheap first gate, complexity analysis for fine-grained cost control, and rate limiting for per-client throttling.

## License

[MIT](LICENSE)
