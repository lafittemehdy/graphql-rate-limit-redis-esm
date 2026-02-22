import { makeExecutableSchema } from "@graphql-tools/schema";
import type {
  ExecutionResult,
  GraphQLResolveInfo,
  GraphQLSchema,
} from "graphql";
import { execute, parse } from "graphql";
import {
  createCompositeKeyGenerator,
  createDefaultKeyGenerator,
  createRateLimitDirective,
  createUserKeyGenerator,
  rateLimitDirectiveTypeDefs,
} from "./index.js";
import type { RateLimitDirectiveArgs } from "./types.js";

const DEFAULT_ITERATIONS = 5_000;
const DEFAULT_WARMUP_ITERATIONS = 1_000;
const DEFAULT_ROUNDS = 3;

interface BenchmarkCase {
  name: string;
  run: () => Promise<void> | void;
}

interface BenchmarkResult {
  maxMicroseconds: number;
  medianMicroseconds: number;
  minMicroseconds: number;
  name: string;
  opsPerSecond: number;
  totalMillisecondsMedian: number;
}

interface BenchContext {
  req?: { ip?: string };
  user?: { id?: string };
}

function readPositiveIntegerFromEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `Invalid ${name}: ${raw}. Expected a positive integer environment value.`,
    );
  }

  return parsed;
}

function formatFixed(value: number, digits = 2): string {
  return value.toLocaleString("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  });
}

function formatInteger(value: number): string {
  return value.toLocaleString("en-US");
}

function padEnd(value: string, width: number): string {
  return value.length >= width
    ? value
    : `${value}${" ".repeat(width - value.length)}`;
}

function padStart(value: string, width: number): string {
  return value.length >= width
    ? value
    : `${" ".repeat(width - value.length)}${value}`;
}

async function runBenchmarkCase(
  benchmarkCase: BenchmarkCase,
  iterations: number,
  rounds: number,
  warmupIterations: number,
): Promise<BenchmarkResult> {
  for (let i = 0; i < warmupIterations; i++) {
    await benchmarkCase.run();
  }

  const elapsedPerRoundMs: number[] = [];
  for (let round = 0; round < rounds; round++) {
    const startMs = performance.now();
    for (let i = 0; i < iterations; i++) {
      await benchmarkCase.run();
    }
    elapsedPerRoundMs.push(performance.now() - startMs);
  }

  const sortedElapsedMs = [...elapsedPerRoundMs].sort((a, b) => a - b);
  const middleIndex = Math.floor(sortedElapsedMs.length / 2);
  const medianElapsedMs =
    sortedElapsedMs.length % 2 === 0
      ? (sortedElapsedMs[middleIndex - 1] + sortedElapsedMs[middleIndex]) / 2
      : sortedElapsedMs[middleIndex];
  const minElapsedMs = sortedElapsedMs[0];
  const maxElapsedMs = sortedElapsedMs[sortedElapsedMs.length - 1];

  return {
    maxMicroseconds: (maxElapsedMs * 1_000) / iterations,
    medianMicroseconds: (medianElapsedMs * 1_000) / iterations,
    minMicroseconds: (minElapsedMs * 1_000) / iterations,
    name: benchmarkCase.name,
    opsPerSecond: (iterations / medianElapsedMs) * 1_000,
    totalMillisecondsMedian: medianElapsedMs,
  };
}

class AllowAllLimiter {
  consume(_key: string): Promise<void> {
    return Promise.resolve();
  }
}

function assertSuccess(result: ExecutionResult<unknown>): void {
  if (result.errors && result.errors.length > 0) {
    throw new Error(`Benchmark query failed: ${result.errors[0]?.message}`);
  }
}

function createGraphQLSchemas(): {
  baselineSchema: GraphQLSchema;
  asyncKeySchema: GraphQLSchema;
  defaultKeySchema: GraphQLSchema;
  document: ReturnType<typeof parse>;
} {
  const baselineSchema = makeExecutableSchema({
    resolvers: {
      Query: {
        test: () => "ok",
      },
    },
    typeDefs: `
      type Query {
        test: String!
      }
    `,
  });

  const rateLimitedSchema = makeExecutableSchema({
    resolvers: {
      Query: {
        test: () => "ok",
      },
    },
    typeDefs: `
      ${rateLimitDirectiveTypeDefs}
      type Query {
        test: String! @rateLimit(limit: 25, duration: 60)
      }
    `,
  });

  const defaultKeySchema = createRateLimitDirective<BenchContext>({
    limiterClass: AllowAllLimiter,
    limiterOptions: { storeClient: {} },
  })(rateLimitedSchema);

  const asyncKeySchema = createRateLimitDirective<BenchContext>({
    keyGenerator: async (_directiveArgs, _source, _args, context, info) =>
      `user:${context.user?.id ?? "anon"}:${info.parentType.name}.${info.fieldName}`,
    limiterClass: AllowAllLimiter,
    limiterOptions: { storeClient: {} },
  })(rateLimitedSchema);

  return {
    asyncKeySchema,
    baselineSchema,
    defaultKeySchema,
    document: parse("{ test }"),
  };
}

function createBenchmarkCases(): BenchmarkCase[] {
  const mockDirectiveArgs: RateLimitDirectiveArgs = { duration: 60, limit: 10 };
  const mockInfo = {
    fieldName: "login",
    parentType: { name: "Mutation" },
  } as unknown as GraphQLResolveInfo;

  const defaultKeyGenerator = createDefaultKeyGenerator();
  const defaultProxyAwareGenerator = createDefaultKeyGenerator({
    trustProxy: true,
  });
  const userKeyGenerator = createUserKeyGenerator<{
    user?: { id?: string | null };
  }>((context) => context.user?.id);
  const compositeKeyGenerator = createCompositeKeyGenerator<{
    apiKey?: string;
    user?: { id?: string | null };
  }>((context) => [
    ["userId", context.user?.id],
    ["apiKey", context.apiKey],
  ]);

  const { asyncKeySchema, baselineSchema, defaultKeySchema, document } =
    createGraphQLSchemas();

  const userContext = {
    user: { id: "bench-user" },
  };

  const forwardedContext = {
    req: {
      headers: {
        "x-forwarded-for": "203.0.113.8, 203.0.113.9",
      },
    },
  };

  const graphqlContext = {
    req: { ip: "127.0.0.1" },
    user: { id: "bench-user" },
  };

  return [
    {
      name: "keygen: default (user id)",
      run: () => {
        const key = defaultKeyGenerator(
          mockDirectiveArgs,
          null,
          {},
          userContext,
          mockInfo,
        );
        if (!key) {
          throw new Error("Invalid benchmark key output.");
        }
      },
    },
    {
      name: "keygen: default (trusted proxy)",
      run: () => {
        const key = defaultProxyAwareGenerator(
          mockDirectiveArgs,
          null,
          {},
          forwardedContext,
          mockInfo,
        );
        if (!key) {
          throw new Error("Invalid benchmark key output.");
        }
      },
    },
    {
      name: "keygen: user factory",
      run: () => {
        const key = userKeyGenerator(
          mockDirectiveArgs,
          null,
          {},
          userContext,
          mockInfo,
        );
        if (!key) {
          throw new Error("Invalid benchmark key output.");
        }
      },
    },
    {
      name: "keygen: composite factory",
      run: () => {
        const key = compositeKeyGenerator(
          mockDirectiveArgs,
          null,
          {},
          { apiKey: "api-key-1", user: { id: "bench-user" } },
          mockInfo,
        );
        if (!key) {
          throw new Error("Invalid benchmark key output.");
        }
      },
    },
    {
      name: "graphql: baseline (no directive)",
      run: async () => {
        const result = await execute({
          contextValue: graphqlContext,
          document,
          schema: baselineSchema,
        });
        assertSuccess(result);
      },
    },
    {
      name: "graphql: rate limit (default keygen)",
      run: async () => {
        const result = await execute({
          contextValue: graphqlContext,
          document,
          schema: defaultKeySchema,
        });
        assertSuccess(result);
      },
    },
    {
      name: "graphql: rate limit (async keygen)",
      run: async () => {
        const result = await execute({
          contextValue: graphqlContext,
          document,
          schema: asyncKeySchema,
        });
        assertSuccess(result);
      },
    },
  ];
}

function printResults(
  results: BenchmarkResult[],
  iterations: number,
  rounds: number,
  warmupIterations: number,
): void {
  const caseColumnWidth = Math.max(
    ...results.map((result) => result.name.length),
    32,
  );

  console.log("graphql-rate-limit-redis-esm benchmark");
  console.log(
    `iterations=${formatInteger(iterations)} warmup=${formatInteger(warmupIterations)} rounds=${formatInteger(rounds)}`,
  );
  console.log("");
  console.log(
    `${padEnd("case", caseColumnWidth)}  ${padStart("ops/s", 14)}  ${padStart("p50 us", 12)}  ${padStart("min us", 12)}  ${padStart("max us", 12)}  ${padStart("p50 ms", 12)}`,
  );
  console.log("-".repeat(caseColumnWidth + 70));

  for (const result of results) {
    console.log(
      `${padEnd(result.name, caseColumnWidth)}  ${padStart(formatFixed(result.opsPerSecond), 14)}  ${padStart(formatFixed(result.medianMicroseconds), 12)}  ${padStart(formatFixed(result.minMicroseconds), 12)}  ${padStart(formatFixed(result.maxMicroseconds), 12)}  ${padStart(formatFixed(result.totalMillisecondsMedian), 12)}`,
    );
  }

  const baseline = results.find(
    (result) => result.name === "graphql: baseline (no directive)",
  );
  if (!baseline) {
    return;
  }

  console.log("");
  console.log("relative graphql overhead vs baseline:");
  for (const result of results.filter((value) =>
    value.name.startsWith("graphql:"),
  )) {
    if (result.name === baseline.name) {
      continue;
    }

    const overheadPercent =
      ((result.medianMicroseconds - baseline.medianMicroseconds) /
        baseline.medianMicroseconds) *
      100;

    console.log(
      `- ${result.name}: ${formatFixed(overheadPercent, 1)}% (p50 ${formatFixed(result.medianMicroseconds, 2)} us vs ${formatFixed(baseline.medianMicroseconds, 2)} us)`,
    );
  }

  console.log(
    "- Tip: compare multiple runs on the same machine and include p50 spread in release decisions.",
  );
}

async function main(): Promise<void> {
  const iterations = readPositiveIntegerFromEnv(
    "BENCH_ITERATIONS",
    DEFAULT_ITERATIONS,
  );
  const rounds = readPositiveIntegerFromEnv("BENCH_ROUNDS", DEFAULT_ROUNDS);
  const warmupIterations = readPositiveIntegerFromEnv(
    "BENCH_WARMUP",
    DEFAULT_WARMUP_ITERATIONS,
  );
  const benchmarkCases = createBenchmarkCases();

  const results: BenchmarkResult[] = [];
  for (const benchmarkCase of benchmarkCases) {
    const result = await runBenchmarkCase(
      benchmarkCase,
      iterations,
      rounds,
      warmupIterations,
    );
    results.push(result);
  }

  printResults(results, iterations, rounds, warmupIterations);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  console.error(message);
  process.exitCode = 1;
});
