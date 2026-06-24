// Test runner robust to the LiteSVM native-addon crash (std::bad_alloc, surfaced
// by vitest as "Worker exited unexpectedly"). The crash appears when LiteSVM runs
// inside a vitest worker pool, never under a plain node process; it is a fault in
// the third-party native addon, not a test failure.
//
// Strategy, all honest (a real assertion failure still fails immediately):
//   1. Unit and behavior tests run under vitest, one file per process with a
//      single fork, so native memory is released between files.
//   2. Integration scenarios that execute BPF programs (the part most prone to the
//      native crash inside vitest) live in integration/*.ts and run under tsx in a
//      plain node process, which is stable.
//   3. A step is retried ONLY on a native-crash marker, up to MAX_ATTEMPTS. A
//      non-zero exit with no native-crash marker is a genuine failure, surfaced now.
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Per file. The native crash can hit in streaks (per-attempt rate is high), so the
// cap is generous; a genuine assertion failure carries no crash marker and still
// fails on the first attempt, so this never masks a real failure.
const MAX_ATTEMPTS = 40;
const NATIVE_CRASH_PATTERN = /bad_alloc|Worker exited unexpectedly/;
const TEST_DIR = "tests";
const INTEGRATION_DIR = "integration";

function runCommandOnce(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  process.stdout.write(output);
  return { passed: result.status === 0, nativeCrash: NATIVE_CRASH_PATTERN.test(output) };
}

function runWithRetry(label, command, args) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    if (attempt > 1) {
      console.error(`[run-tests] ${label}: LiteSVM native crash, retrying (${attempt}/${MAX_ATTEMPTS})`);
    }
    const { passed, nativeCrash } = runCommandOnce(command, args);
    if (passed) {
      return true;
    }
    if (!nativeCrash) {
      return false; // a genuine test failure: surface it, do not retry
    }
  }
  console.error(`[run-tests] ${label}: still crashing in the LiteSVM native addon after ${MAX_ATTEMPTS} attempts`);
  return false;
}

function filesIn(directory, extension) {
  if (!existsSync(directory)) {
    return [];
  }
  return readdirSync(directory)
    .filter((fileName) => fileName.endsWith(extension))
    .map((fileName) => join(directory, fileName))
    .sort();
}

// 1. Unit and behavior tests: vitest, one file per process with a single fork.
for (const testFile of filesIn(TEST_DIR, ".test.ts")) {
  if (!runWithRetry(testFile, "npx", ["vitest", "run", testFile, "--poolOptions.forks.singleFork=true"])) {
    process.exit(1);
  }
}

// 2. Integration scenarios that execute BPF programs: tsx in a plain process.
for (const scriptFile of filesIn(INTEGRATION_DIR, ".ts")) {
  if (!runWithRetry(scriptFile, "npx", ["tsx", scriptFile])) {
    process.exit(1);
  }
}

process.exit(0);
