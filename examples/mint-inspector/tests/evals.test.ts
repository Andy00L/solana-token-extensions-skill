import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { type EvalSuite, parseEvalSuite, runEvalCase, runEvalSuite } from "../src/evals";

// evals.json lives at the package root, one level above tests/.
const SUITE_PATH = fileURLToPath(new URL("../evals.json", import.meta.url));

function readRawSuite(): unknown {
  return JSON.parse(readFileSync(SUITE_PATH, "utf8")) as unknown;
}

function loadSuite(): EvalSuite {
  const parsed = parseEvalSuite(readRawSuite());
  if (!parsed.ok) {
    throw new Error(parsed.error);
  }
  return parsed.suite;
}

describe("scored eval suite (evals.json against the real risk engine)", () => {
  it("validates against the suite schema", () => {
    const parsed = parseEvalSuite(readRawSuite());
    expect(parsed.ok).toBe(true);
  });

  it("runs every case and scores 100% (no verdict regression)", () => {
    const report = runEvalSuite(loadSuite());
    // Surface exactly which case and which assertion failed, not just a count.
    const failures = report.results
      .filter((result) => !result.ok)
      .map((result) => `${result.id}: ${result.failures.join("; ")}`);
    expect(failures).toEqual([]);
    expect(report.passed).toBe(report.total);
    expect(report.accuracy).toBe(100);
  });

  it("covers the executable EVALS.md rows, with no vacuous case", () => {
    const suite = loadSuite();
    expect(suite.cases.length).toBeGreaterThanOrEqual(16);

    for (const evalCase of suite.cases) {
      // No case may pass vacuously: each must assert at least one field.
      expect(Object.keys(evalCase.expect).length).toBeGreaterThan(0);
      // Every case is runnable and keeps its identity through the runner.
      expect(runEvalCase(evalCase).id).toBe(evalCase.id);
    }

    const referencedRows = new Set(
      suite.cases
        .map((evalCase) => evalCase.evalsRef)
        .filter((reference): reference is number => reference !== undefined),
    );
    for (const expectedRow of [4, 5, 10, 11, 13, 14, 15, 17, 19]) {
      expect(referencedRows.has(expectedRow)).toBe(true);
    }
  });
});
