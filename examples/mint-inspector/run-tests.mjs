// Test runner that retries ONLY on a LiteSVM native-addon crash (std::bad_alloc
// or a vitest worker exit). LiteSVM 0.6.0 occasionally aborts its native worker
// on memory-constrained machines; that is a transient fault in a third-party
// native dependency, not a test failure. A real test failure (non-zero exit with
// no native crash in the output) fails immediately and is never masked or retried.
import { spawnSync } from "node:child_process";

const MAX_ATTEMPTS = 4;
const NATIVE_CRASH_PATTERN = /bad_alloc|Worker exited unexpectedly/;

function runVitestOnce() {
  const result = spawnSync("npx", ["vitest", "run"], { encoding: "utf8" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(output);
  return { passed: result.status === 0, nativeCrash: NATIVE_CRASH_PATTERN.test(output) };
}

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  if (attempt > 1) {
    console.error(`[run-tests] LiteSVM native crash, retrying (${attempt}/${MAX_ATTEMPTS})`);
  }
  const { passed, nativeCrash } = runVitestOnce();
  if (passed) {
    process.exit(0);
  }
  if (!nativeCrash) {
    // A genuine test failure: surface it, do not retry.
    process.exit(1);
  }
}

console.error("[run-tests] still crashing in the LiteSVM native addon after retries");
process.exit(1);
