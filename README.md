# graphql-rate-limit-redis-esm

[![npm version](https://img.shields.io/npm/v/graphql-rate-limit-redis-esm)](https://www.npmjs.com/package/graphql-rate-limit-redis-esm)
[![CI](https://github.com/lafittemehdy/graphql-rate-limit-redis-esm/actions/workflows/test.yml/badge.svg)](https://github.com/lafittemehdy/graphql-rate-limit-redis-esm/actions/workflows/test.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D22.0.0-brightgreen)](https://nodejs.org/)

Production-ready GraphQL rate limiting directive for Redis with ESM support.

[Live Demo](https://lafittemehdy.github.io/graphql-rate-limit-redis-esm/architecture.html)

## What it is
`graphql-rate-limit-redis-esm` is an ESM GraphQL schema transformer that applies a `@rateLimit(limit: Int!, duration: Int!)` directive to field resolvers.

At runtime, each decorated field calls a limiter instance (`consume(key)`) before resolver execution. The package also exports key-generator factories, standardized GraphQL error helpers, and TypeScript types.

## Key capabilities
- GraphQL directive SDL export: `rateLimitDirectiveTypeDefs`.
- Directive transformer factory: `createRateLimitDirective(config)`.
- Schema-time validation of directive arguments and runtime limits.
- Limiter instance reuse per unique `(duration, limit)` pair, with a configurable cache-size ceiling.
- Custom key generator support (sync or async).
- Built-in key generator helpers: default, user, IP, and composite.
- Service failure modes: `failClosed` (default) or `failOpen`.
- Standardized GraphQL error responses for rate-limit, key-generation, and limiter-service failures.
- ESM package output with exported TypeScript types.

## Installation
### Requirements
- Node.js `>=22.0.0` (from `engines`).
- Peer dependencies:
  - `graphql` `^16.0.0`
  - `@graphql-tools/utils` `^10.0.0 || ^11.0.0`
  - `rate-limiter-flexible` `^8.0.0 || ^9.0.0`

If you use `RateLimiterRedis`, you also need a Redis client (for example `ioredis`) and a reachable Redis server.

```bash
pnpm add graphql-rate-limit-redis-esm graphql @graphql-tools/utils @graphql-tools/schema rate-limiter-flexible
pnpm add ioredis
```

## Quickstart
```ts
import { makeExecutableSchema } from "@graphql-tools/schema";
import Redis from "ioredis";
import { RateLimiterRedis } from "rate-limiter-flexible";
import {
  createRateLimitDirective,
  rateLimitDirectiveTypeDefs,
} from "graphql-rate-limit-redis-esm";

const redis = new Redis("redis://localhost:6379");

const transformRateLimit = createRateLimitDirective({
  limiterClass: RateLimiterRedis,
  limiterOptions: {
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

## Configuration
### `createRateLimitDirective(config)`
| Field | Required | Default | Notes |
| --- | --- | --- | --- |
| `limiterClass` | Yes | None | Must be a constructor that returns an object with `consume(key): Promise<unknown>`. |
| `limiterOptions` | Yes | None | Must be an object and include `storeClient` (not `null`/`undefined`). |
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

`trustProxy: true` requires `includeIP !== false`.

### Built-in default key generator behavior
Identity priority order:
1. User: `context.user.id` or `context.userId`
2. IP: `context.req.ip` or `context.ip`
3. API key: `context.apiKey` or header `x-api-key`
4. Fallback: `anonymousIdentity` (default `"anonymous"`)

Notes:
- Every key includes field scope suffix: `:<ParentType>.<fieldName>`.
- `x-forwarded-for` is used only when `trustProxy: true`; first IP is selected.
- Header reads support both plain objects and `Headers` instances, case-insensitively.

## Usage
### Public exports
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

const byUser = createUserKeyGenerator((ctx) => ctx.user?.id);
const byIp = createIPKeyGenerator((ctx) => ctx.req?.ip);
const composite = createCompositeKeyGenerator((ctx) => [
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
| `pnpm run clean` | Remove `dist/` |
| `pnpm run build` | Clean + TypeScript build (`tsc`) |
| `pnpm run dev` | TypeScript watch mode |
| `pnpm run lint` | Biome check + `tsc --noEmit` |
| `pnpm run lint:fix` | Biome autofix + `tsc --noEmit` |
| `pnpm test` | `vitest run` |
| `pnpm run test:watch` | `vitest` |
| `pnpm run test:ui` | `vitest --ui` |
| `pnpm run test:coverage` | `vitest run --coverage` |
| `pnpm run benchmark` | Clean + build with `tsconfig.bench.json` + run `dist/bench.js` |
| `pnpm run prepublishOnly` | Lint + build + test |

## Architecture
- `src/index.ts`: public export surface.
- `src/directive.ts`: directive SDL, transformer, config validation, limiter instantiation/cache, resolver wrapping.
- `src/key-generators.ts`: default and factory key generators, key-part normalization, header/context extraction.
- `src/errors.ts`: GraphQL error factories and retry-after conversion.
- `src/types.ts`: public TypeScript interfaces and type aliases.
- `src/bench.ts`: benchmark harness.
- `src/__tests__/`: unit and Redis-backed integration tests.
- `examples/visualization/architecture.html`: interactive rate-limiting demo.

## Troubleshooting
- Schema build throws `Invalid rate limit` or `Invalid duration`.
  - Cause: directive values are non-positive integers or exceed runtime limits.
  - Fix: use valid positive integers and/or adjust `runtimeLimits`.
- Schema build throws `Limiter cache size exceeded (...)`.
  - Cause: too many unique `(duration, limit)` combinations across decorated fields.
  - Fix: reduce unique combinations or increase `runtimeLimits.maxLimiterCacheSize`.
- Requests fail with `RATE_LIMIT_KEY_ERROR`.
  - Cause: key generator threw, returned empty/whitespace, or returned a key longer than `maxKeyLength` (default `512`).
  - Fix: return a non-empty string key and keep it within length bounds.
- Requests fail with `RATE_LIMIT_SERVICE_ERROR`.
  - Cause: limiter backend threw a non-rate-limit error (for example Redis unavailable) and mode is `failClosed`.
  - Fix: restore backend connectivity or set `serviceErrorMode: "failOpen"` if availability-first behavior is acceptable.
- `x-forwarded-for` appears ignored.
  - Cause: default key generator does not trust forwarded headers unless `trustProxy: true`.
  - Fix: enable `trustProxy: true` only behind trusted proxies.

## Contributing / Development notes
- Repo package manager is pinned as `pnpm@10.18.3`.
- Minimum Node version is `22`.
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
  | Functions | 90% |
  | Lines | 90% |
  | Statements | 90% |

## Code <-> Docs mapping
| Section / claim | Source files |
| --- | --- |
| What the package exports and how consumers import it | `src/index.ts`, `package.json` |
| Directive signature, transformer behavior, config validation, runtime limit defaults, service error mode | `src/directive.ts`, `src/types.ts` |
| Default key identity order, proxy behavior, header extraction, key factories | `src/key-generators.ts`, `src/__tests__/key-generators.test.ts` |
| Error messages/codes/status fields and retry-after calculation | `src/errors.ts`, `src/__tests__/errors.test.ts`, `src/__tests__/directive.test.ts` |
| Node/peer requirements and package metadata | `package.json` |
| Repository scripts and benchmark execution | `package.json`, `src/bench.ts`, `tsconfig.bench.json` |
| Benchmark/test environment variables | `src/bench.ts`, `src/__tests__/redis.integration.test.ts`, `.github/workflows/test.yml` |
| Repository module layout and visualization artifact | `src/index.ts`, `src/directive.ts`, `src/key-generators.ts`, `src/errors.ts`, `src/types.ts`, `src/bench.ts`, `src/__tests__/`, `examples/visualization/architecture.html` |

## License

[MIT](./LICENSE)
