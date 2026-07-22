/** Creates the bounded-failure Redis client shared by the runnable server examples. */

import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

export function createExampleRedisClient(): Redis {
	const redis = new Redis(REDIS_URL, {
		commandTimeout: 5_000,
		connectTimeout: 5_000,
		enableOfflineQueue: false,
		lazyConnect: true,
		maxRetriesPerRequest: 1,
		retryStrategy: (attempt) => Math.min(attempt * 200, 5_000),
	});

	redis.on("error", (error) => {
		console.error(`Redis connection error: ${error.message}`);
	});

	return redis;
}
