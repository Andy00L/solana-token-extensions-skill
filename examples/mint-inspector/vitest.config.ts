import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    // LiteSVM is a native addon with a large per-instance footprint and no
    // explicit free. Run files serially, each in its own isolated fork that is
    // torn down before the next, so native memory never peaks across workers.
    pool: "forks",
    fileParallelism: false,
  },
});
