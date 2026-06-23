import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 30000,
    // LiteSVM is a native addon with a large per-instance footprint and no
    // explicit free, and it intermittently aborts inside a vitest worker pool.
    // Run files serially in a single persistent fork (the pattern that is stable
    // outside vitest); run-tests.mjs additionally runs each file in its own
    // process and retries only on a native crash.
    pool: "forks",
    fileParallelism: false,
    poolOptions: { forks: { singleFork: true } },
  },
});
