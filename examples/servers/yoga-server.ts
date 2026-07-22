/**
 * GraphQL Yoga example with graphql-rate-limit-redis-esm.
 *
 * Requires a running Redis server on localhost:6379.
 *
 * Run:  pnpm example:yoga
 */

import { createServer, type IncomingMessage } from "node:http";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { createYoga } from "graphql-yoga";
import { RateLimiterRedis } from "rate-limiter-flexible";
import { createRateLimitDirective } from "../../src/index.js";
import { createExampleRedisClient } from "./redis.js";
import { printBanner, resolvers, typeDefs } from "./schema.js";

interface NodeServerContext {
	req: IncomingMessage;
}

const redis = createExampleRedisClient();
await redis.connect();
await redis.ping();

const rateLimitTransformer = createRateLimitDirective<NodeServerContext>({
	limiterClass: RateLimiterRedis,
	limiterOptions: {
		keyPrefix: "graphql-rate-limit-example",
		rejectIfRedisNotReady: true,
		storeClient: redis,
	},
});

const schema = rateLimitTransformer(makeExecutableSchema({ resolvers, typeDefs }));

const yoga = createYoga<NodeServerContext>({ schema });

const PORT = 4000;
const server = createServer(yoga);
server.listen(PORT, () => {
	printBanner(PORT);
	console.log("GraphQL Yoga ready");
});
