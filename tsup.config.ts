import { defineConfig } from "tsup";

export default defineConfig({
	clean: true,
	dts: true,
	entry: ["src/index.ts"],
	external: ["@graphql-tools/utils", "graphql", "rate-limiter-flexible"],
	format: ["cjs", "esm"],
	outDir: "dist",
	sourcemap: true,
	target: "es2022",
});
