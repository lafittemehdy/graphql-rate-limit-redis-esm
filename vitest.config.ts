import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    dedupe: ["graphql", "@graphql-tools/schema", "@graphql-tools/utils"],
  },
  test: {
    coverage: {
      provider: "v8",
      reporter: ["html", "json", "text"],
    },
    environment: "node",
    exclude: ["**/dist/**", "**/node_modules/**"],
    globals: true,
    server: {
      deps: {
        inline: ["graphql", "@graphql-tools/schema", "@graphql-tools/utils"],
      },
    },
  },
});
