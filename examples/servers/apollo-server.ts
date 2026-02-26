/**
 * Apollo Server example with graphql-rate-limit-redis-esm.
 *
 * Requires a running Redis server on localhost:6379.
 *
 * Run:  pnpm example:apollo
 */

import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { makeExecutableSchema } from "@graphql-tools/schema";
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

const server = new ApolloServer({ schema });

const PORT = 4000;
const { url } = await startStandaloneServer(server, { listen: { port: PORT } });
printBanner(PORT);
console.log(`Apollo Server ready at ${url}`);
