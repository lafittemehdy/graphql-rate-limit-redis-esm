/**
 * GraphQL Yoga example with graphql-rate-limit-redis-esm.
 *
 * Requires a running Redis server on localhost:6379.
 *
 * Run:  pnpm example:yoga
 */

import { createServer } from "node:http";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { createYoga } from "graphql-yoga";
import Redis from "ioredis";
import { RateLimiterRedis } from "rate-limiter-flexible";
import { createRateLimitDirective } from "../../src/index.js";
import { printBanner, resolvers, typeDefs } from "./schema.js";

const redis = new Redis("redis://localhost:6379");

const rateLimitTransformer = createRateLimitDirective({
	limiterClass: RateLimiterRedis,
	limiterOptions: { storeClient: redis },
});

const schema = rateLimitTransformer(makeExecutableSchema({ resolvers, typeDefs }));

const yoga = createYoga({ schema });

const PORT = 4000;
const server = createServer(yoga);
server.listen(PORT, () => {
	printBanner(PORT);
	console.log("GraphQL Yoga ready");
});
