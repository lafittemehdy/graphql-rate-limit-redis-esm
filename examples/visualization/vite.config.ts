/** Configures the Vite build and GitHub Pages base path for the visualization example. */

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  base: "/graphql-rate-limit-redis-esm/",
  plugins: [react()],
});
