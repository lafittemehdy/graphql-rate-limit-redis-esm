import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    dedupe: ["graphql", "@graphql-tools/schema", "@graphql-tools/utils"],
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["html", "json", "text"],
      thresholds: {
        branches: 85,
        functions: 90,
        lines: 90,
        statements: 90,
      },
    },
    environment: "node",
    exclude: ["**/dist/**", "**/node_modules/**"],
    server: {
      deps: {
        inline: ["graphql", "@graphql-tools/schema", "@graphql-tools/utils"],
      },
    },
  },
});
