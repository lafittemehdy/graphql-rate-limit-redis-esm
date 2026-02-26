import { describe, expect, it } from "vitest";
import {
	createRateLimitedError,
	createRateLimitKeyError,
	createRateLimitServiceError,
	isRateLimitRejection,
	toRetryAfterSeconds,
} from "../errors.js";

describe("Error Utilities", () => {
	describe("isRateLimitRejection", () => {
		it("should return true for objects with numeric msBeforeNext", () => {
			expect(isRateLimitRejection({ msBeforeNext: 5000 })).toBe(true);
		});

		it("should return true for zero msBeforeNext", () => {
			expect(isRateLimitRejection({ msBeforeNext: 0 })).toBe(true);
		});

		it("should return true for negative msBeforeNext", () => {
			expect(isRateLimitRejection({ msBeforeNext: -100 })).toBe(true);
		});

		it("should return false for null", () => {
			expect(isRateLimitRejection(null)).toBe(false);
		});

		it("should return false for undefined", () => {
			expect(isRateLimitRejection(undefined)).toBe(false);
		});

		it("should return false for strings", () => {
			expect(isRateLimitRejection("error")).toBe(false);
		});

		it("should return false for objects without msBeforeNext", () => {
			expect(isRateLimitRejection({ message: "error" })).toBe(false);
		});

		it("should return false for non-numeric msBeforeNext", () => {
			expect(isRateLimitRejection({ msBeforeNext: "5000" })).toBe(false);
		});

		it("should return false for NaN msBeforeNext", () => {
			expect(isRateLimitRejection({ msBeforeNext: Number.NaN })).toBe(false);
		});
	});

	describe("toRetryAfterSeconds", () => {
		it("should convert milliseconds to seconds with ceiling", () => {
			expect(toRetryAfterSeconds(5000)).toBe(5);
		});

		it("should round up partial seconds", () => {
			expect(toRetryAfterSeconds(1500)).toBe(2);
		});

		it("should return 1 for values under 1 second", () => {
			expect(toRetryAfterSeconds(100)).toBe(1);
		});

		it("should return 1 for exactly 1 millisecond", () => {
			expect(toRetryAfterSeconds(1)).toBe(1);
		});

		it("should return 1 for zero", () => {
			expect(toRetryAfterSeconds(0)).toBe(1);
		});

		it("should return 1 for negative values", () => {
			expect(toRetryAfterSeconds(-5000)).toBe(1);
		});

		it("should return 1 for NaN", () => {
			expect(toRetryAfterSeconds(Number.NaN)).toBe(1);
		});

		it("should return 1 for Infinity", () => {
			expect(toRetryAfterSeconds(Number.POSITIVE_INFINITY)).toBe(1);
		});

		it("should return 1 for negative Infinity", () => {
			expect(toRetryAfterSeconds(Number.NEGATIVE_INFINITY)).toBe(1);
		});
	});

	describe("createRateLimitedError", () => {
		it("should create error with correct extensions", () => {
			const error = createRateLimitedError(5000);

			expect(error.message).toBe("Rate limit exceeded");
			expect(error.extensions?.code).toBe("RATE_LIMITED");
			expect(error.extensions?.http).toEqual({ status: 429 });
			expect(error.extensions?.retryAfter).toBe(5);
		});

		it("should sanitize invalid msBeforeNext", () => {
			const error = createRateLimitedError(-1);

			expect(error.extensions?.retryAfter).toBe(1);
		});
	});

	describe("createRateLimitKeyError", () => {
		it("should create error with correct extensions", () => {
			const error = createRateLimitKeyError();

			expect(error.message).toBe("Rate limiting key generation failed");
			expect(error.extensions?.code).toBe("RATE_LIMIT_KEY_ERROR");
			expect(error.extensions?.http).toEqual({ status: 500 });
		});
	});

	describe("createRateLimitServiceError", () => {
		it("should create error with correct extensions", () => {
			const error = createRateLimitServiceError();

			expect(error.message).toBe("Rate limiting service unavailable");
			expect(error.extensions?.code).toBe("RATE_LIMIT_SERVICE_ERROR");
			expect(error.extensions?.http).toEqual({ status: 503 });
		});
	});
});
