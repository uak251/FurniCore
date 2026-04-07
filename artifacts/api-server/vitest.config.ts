import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    // Suppress noisy output from pino in tests
    env: {
      NODE_ENV: "test",
      LOG_LEVEL: "silent",
    },
    testTimeout: 10_000,
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/middlewares/**", "src/routes/**"],
    },
  },
});
