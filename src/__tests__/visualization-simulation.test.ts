/** Specifies that the visualization models Redis counters independently per generated key. */

import { describe, expect, it } from "vitest";
import {
	getOrCreateLimiterState,
	simulateRequest,
} from "../../examples/visualization/src/lib/simulation-engine.js";
import type {
	LimiterState,
	RateLimitConfig,
} from "../../examples/visualization/src/types/rate-limit.js";

const DEFAULT_CONFIG: RateLimitConfig = {
	duration: 60,
	identity: "user",
	limit: 5,
	serviceErrorMode: "failClosed",
};

describe("visualization simulation", () => {
	it("preserves independent windows for distinct policy and identity keys", () => {
		const statesByKey = new Map<string, LimiterState>();
		const userState = getOrCreateLimiterState(DEFAULT_CONFIG, statesByKey, false);
		simulateRequest(DEFAULT_CONFIG, userState);
		simulateRequest(DEFAULT_CONFIG, userState);

		const ipConfig: RateLimitConfig = { ...DEFAULT_CONFIG, identity: "ip" };
		const ipState = getOrCreateLimiterState(ipConfig, statesByKey, false);
		expect(ipState.consumed).toBe(0);
		simulateRequest(ipConfig, ipState);

		const distinctPolicy: RateLimitConfig = { ...DEFAULT_CONFIG, limit: 6 };
		const distinctPolicyState = getOrCreateLimiterState(distinctPolicy, statesByKey, false);
		expect(distinctPolicyState.consumed).toBe(0);
		expect(getOrCreateLimiterState(DEFAULT_CONFIG, statesByKey, false).consumed).toBe(2);
		expect(ipState.consumed).toBe(1);
		expect(statesByKey.size).toBe(3);
	});
});
