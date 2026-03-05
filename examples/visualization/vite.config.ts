import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/graphql-rate-limit-redis-esm/",
  plugins: [react()],
});
