#!/usr/bin/env node
/**
 * Runnable, scored eval suite entry point.
 *
 * Loads evals.json, runs every case through the inspector's risk engine, prints a
 * per-case PASS/FAIL table and an overall accuracy, and exits non-zero if any case
 * fails, so CI and `make verify` catch a regression in the verdicts. Offline and
 * deterministic: it decodes captured mainnet bytes and never touches the network.
 *
 * Usage: npm run evals [-- --json]
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describeError } from "./describe-error";
import { type EvalSuiteReport, parseEvalSuite, runEvalSuite } from "./evals";

// evals.json lives at the package root, one level above src/.
const SUITE_PATH = fileURLToPath(new URL("../evals.json", import.meta.url));

type LoadResult = { ok: true; raw: unknown } | { ok: false; error: string };

function loadSuiteJson(path: string): LoadResult {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (readError: unknown) {
    return { ok: false, error: `cannot read ${path}: ${describeError(readError)}` };
  }
  try {
    return { ok: true, raw: JSON.parse(text) as unknown };
  } catch (parseError: unknown) {
    return { ok: false, error: `evals.json is not valid JSON: ${describeError(parseError)}` };
  }
}

function formatReport(report: EvalSuiteReport): string {
  const lines: string[] = [];
  lines.push("Mint inspector eval suite (offline, deterministic)");
  lines.push("");
  for (const result of report.results) {
    const status = result.ok ? "PASS" : "FAIL";
    const reference = result.evalsRef === null ? "" : ` (EVALS #${result.evalsRef})`;
    lines.push(`  [${status}] ${result.id}${reference}`);
    if (!result.ok) {
      for (const failure of result.failures) {
        lines.push(`         - ${failure}`);
      }
    }
  }
  lines.push("");
  lines.push(`Accuracy: ${report.passed}/${report.total} cases passed (${report.accuracy}%)`);
  return lines.join("\n");
}

function main(): number {
  const asJson = process.argv.slice(2).includes("--json");

  const loaded = loadSuiteJson(SUITE_PATH);
  if (!loaded.ok) {
    process.stderr.write(`[EvalsCli] ${loaded.error}\n`);
    return 2;
  }
  const parsed = parseEvalSuite(loaded.raw);
  if (!parsed.ok) {
    process.stderr.write(`[EvalsCli] ${parsed.error}\n`);
    return 2;
  }

  const report = runEvalSuite(parsed.suite);
  if (asJson) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatReport(report)}\n`);
  }
  return report.failed === 0 ? 0 : 1;
}

process.exit(main());
