/** Verifies the published CommonJS declarations accept the documented limiter contract. */

import rateLimiterFlexible = require("rate-limiter-flexible");
import packageApi = require("graphql-rate-limit-redis-esm");

interface RequestContext {
	user?: { id?: string };
}

interface StrictLimiterOptions {
	storeClient: unknown;
	token: string;
}

declare const publicLimiter: packageApi.RateLimiterClass;
declare const strictLimiter: packageApi.RateLimiterClass<StrictLimiterOptions>;
const redisAdapter: packageApi.RateLimiterClass = rateLimiterFlexible.RateLimiterRedis;

new publicLimiter({ storeClient: {} });
new redisAdapter({ duration: 1, points: 1, storeClient: {} });
new strictLimiter({ storeClient: {}, token: "required" });
// @ts-expect-error The generic constructor contract preserves required adapter options.
new strictLimiter({ storeClient: {} });

const transformSchema = packageApi.createRateLimitDirective<RequestContext>({
	keyGenerator: packageApi.createUserKeyGenerator<RequestContext>((context) => context.user?.id),
	limiterClass: rateLimiterFlexible.RateLimiterRedis,
	limiterOptions: { storeClient: {} },
});

void transformSchema;
