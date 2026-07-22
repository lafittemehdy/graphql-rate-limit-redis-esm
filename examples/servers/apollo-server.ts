/**
 * Apollo Server example with graphql-rate-limit-redis-esm.
 *
 * Requires a running Redis server on localhost:6379.
 *
 * Run:  pnpm example:apollo
 */

import type { IncomingMessage } from "node:http";
import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { RateLimiterRedis } from "rate-limiter-flexible";
import { createRateLimitDirective } from "../../src/index.js";
import { createExampleRedisClient } from "./redis.js";
import { printBanner, resolvers, typeDefs } from "./schema.js";

interface ApolloContext {
	req: IncomingMessage;
}

const redis = createExampleRedisClient();
await redis.connect();
await redis.ping();

const rateLimitTransformer = createRateLimitDirective<ApolloContext>({
	limiterClass: RateLimiterRedis,
	limiterOptions: {
		keyPrefix: "graphql-rate-limit-example",
		rejectIfRedisNotReady: true,
		storeClient: redis,
	},
});

const schema = rateLimitTransformer(makeExecutableSchema({ resolvers, typeDefs }));

const server = new ApolloServer<ApolloContext>({ schema });

const PORT = 4000;
const { url } = await startStandaloneServer(server, {
	context: async ({ req }) => ({ req }),
	listen: { port: PORT },
});
printBanner(PORT);
console.log(`Apollo Server ready at ${url}`);
