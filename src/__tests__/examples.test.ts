/** Specifies bounded connection and command behavior for the runnable Redis examples. */

import { describe, expect, it } from "vitest";
import { createExampleRedisClient } from "../../examples/servers/redis.js";

describe("runnable Redis example", () => {
	it("configures explicit startup and bounded command failure", () => {
		const redis = createExampleRedisClient();

		try {
			expect(redis.options.commandTimeout).toBe(5_000);
			expect(redis.options.enableOfflineQueue).toBe(false);
			expect(redis.options.lazyConnect).toBe(true);
		} finally {
			redis.disconnect();
		}
	});
});
