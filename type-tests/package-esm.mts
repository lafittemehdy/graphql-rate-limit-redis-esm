/** Verifies the published ESM declarations accept the documented limiter contract. */

import {
	createRateLimitDirective,
	createUserKeyGenerator,
	type RateLimiterClass,
} from "graphql-rate-limit-redis-esm";
import { RateLimiterRedis } from "rate-limiter-flexible";

interface RequestContext {
	user?: { id?: string };
}

interface StrictLimiterOptions {
	storeClient: unknown;
	token: string;
}

declare const publicLimiter: RateLimiterClass;
declare const strictLimiter: RateLimiterClass<StrictLimiterOptions>;
const redisAdapter: RateLimiterClass = RateLimiterRedis;

new publicLimiter({ storeClient: {} });
new redisAdapter({ duration: 1, points: 1, storeClient: {} });
new strictLimiter({ storeClient: {}, token: "required" });
// @ts-expect-error The generic constructor contract preserves required adapter options.
new strictLimiter({ storeClient: {} });

const transformSchema = createRateLimitDirective<RequestContext>({
	keyGenerator: createUserKeyGenerator<RequestContext>((context) => context.user?.id),
	limiterClass: RateLimiterRedis,
	limiterOptions: { storeClient: {} },
});

void transformSchema;
