import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// During local dev, proxy /api to the FastAPI backend so the browser talks to
// a single origin (no CORS dance). In production the API base is configured
// via VITE_API_BASE at build time.
export default defineConfig({
  // 058-online-demo-mode: GitHub Pages serves a project site under `/<repo>/`,
  // so asset URLs must carry that prefix. The Pages workflow sets
  // BASE_PATH=/AgentSimulator/; locally (unset) it stays "/" — unchanged.
  base: process.env.BASE_PATH ?? "/",
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
  // Vitest: jsdom gives the theme store a real localStorage + document; tests
  // run fully offline (the no-hardcoded-colors guard just reads source files).
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
