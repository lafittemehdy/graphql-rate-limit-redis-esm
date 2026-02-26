import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		dedupe: ["graphql", "@graphql-tools/schema", "@graphql-tools/utils"],
	},
	test: {
		coverage: {
			exclude: ["dist/**", "examples/**", "src/__tests__/**", "tsup.config.ts", "vitest.config.ts"],
			provider: "v8",
			reporter: ["html", "json", "text"],
			thresholds: {
				branches: 85,
				functions: 100,
				lines: 93,
				statements: 93,
			},
		},
		environment: "node",
		server: {
			deps: {
				inline: ["graphql", "@graphql-tools/schema", "@graphql-tools/utils"],
			},
		},
	},
});
