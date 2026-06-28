/**
 * Runnable, scored eval suite for the mint inspector.
 *
 * It turns the representative cases in EVALS.md into executable checks: each case
 * feeds a concrete input (a planned extension set with authority liveness, or a
 * captured mainnet mint) through the SAME decision engine the inspector and the
 * MCP tools use, then compares the produced verdict against an expected one. The
 * result is a reproducible accuracy number, not a prose claim of correctness.
 *
 * Pure and deterministic: the engine does no IO and the mainnet inputs are decoded
 * from captured bytes (src/mainnet-fixtures.ts), so the suite runs fully offline.
 * Errors are values: a malformed suite or an unresolved fixture becomes a typed
 * parse error or a failed case, never a throw.
 */
import { z } from "zod";
import {
  type AssessedExtension,
  type Conflict,
  type MintAuthorityLiveness,
  type Remediation,
  type Severity,
  assessExtensions,
  projectRenouncements,
} from "./assess-risk";
import { catalogEntries } from "./extension-catalog";
import { formatList, inspectAccount } from "./inspect";
import { fixtureAccountInfo, fixtureAddress, fixtureByName } from "./mainnet-fixtures";

// The five severity tiers, mirrored from assess-risk Severity so the JSON can be
// validated without hardcoding the tier names in more than one place here.
const SEVERITY_VALUES = ["critical", "high", "medium", "low", "info"] as const;
const SeveritySchema = z.enum(SEVERITY_VALUES);

const TransferFeeSchema = z.object({
  activeBasisPoints: z.number().int().min(0),
  scheduledBasisPoints: z.number().int().min(0).nullable(),
});

const AssessedExtensionSchema = z.object({
  id: z.string().min(1),
  authorityRenounced: z.boolean().optional(),
  transferFee: TransferFeeSchema.optional(),
});

const MintAuthoritiesSchema = z.object({
  mintAuthorityLive: z.boolean(),
  freezeAuthorityLive: z.boolean(),
});

// A planned (or hypothetical) extension set, with optional authority liveness, run
// straight through the risk engine. This covers the "vet a set" and conditional
// severity cases without needing a live mint.
const SetInputSchema = z.object({
  kind: z.literal("set"),
  extensions: z.array(AssessedExtensionSchema).min(1),
  mintAuthorities: MintAuthoritiesSchema.optional(),
});

// A captured mainnet mint, decoded from real bytes so the verdict is checked
// against genuine on-chain data.
const FixtureInputSchema = z.object({
  kind: z.literal("fixture"),
  fixture: z.string().min(1),
});

const InputSchema = z.discriminatedUnion("kind", [SetInputSchema, FixtureInputSchema]);

const ExtensionDetailExpectSchema = z.object({
  extension: z.string().min(1),
  key: z.string().min(1),
  equals: z.string(),
});

const RemediationExpectSchema = z.object({
  currentSeverity: SeveritySchema.optional(),
  // The severity once every renounceable authority is renounced (the remediation
  // floor): the all-renounced projection, or the single step when there is one.
  floorSeverity: SeveritySchema.optional(),
  // A single renounce step and the severity it reaches.
  step: z.object({ target: z.string().min(1), afterSeverity: SeveritySchema }).optional(),
});

// Every assertion is optional; a case checks only the fields it sets. An empty
// expectation passes trivially, so each case sets at least one meaningful field.
const ExpectSchema = z.object({
  severity: SeveritySchema.optional(),
  score: z.number().int().min(0).max(100).optional(),
  cexBlockersInclude: z.array(z.string()).optional(),
  cexBlockersExclude: z.array(z.string()).optional(),
  cexListable: z.boolean().optional(),
  conflictInitRejected: z.boolean().optional(),
  conflictTitleContains: z.string().optional(),
  decodedExtensionsInclude: z.array(z.string()).optional(),
  decodedExtensionsEqual: z.array(z.string()).optional(),
  noUnrecognized: z.boolean().optional(),
  extensionDetail: ExtensionDetailExpectSchema.optional(),
  remediation: RemediationExpectSchema.optional(),
}).refine((expectation) => Object.keys(expectation).length > 0, {
  // A case with an empty expect would pass trivially; reject it at parse time so the
  // standalone CLI is protected, not only the vitest gate.
  message: "expect must assert at least one field (no vacuous cases)",
});

const EvalCaseSchema = z.object({
  id: z.string().min(1),
  // The EVALS.md row this case operationalizes, for traceability back to the table.
  evalsRef: z.number().int().positive().optional(),
  prompt: z.string().min(1),
  rationale: z.string().optional(),
  input: InputSchema,
  expect: ExpectSchema,
});

const EvalSuiteSchema = z
  .object({
    version: z.number().int().positive(),
    description: z.string().min(1),
    cases: z.array(EvalCaseSchema).min(1),
  })
  .refine((suite) => new Set(suite.cases.map((evalCase) => evalCase.id)).size === suite.cases.length, {
    message: "every case id must be unique",
  });

export type EvalCase = z.infer<typeof EvalCaseSchema>;
export type EvalSuite = z.infer<typeof EvalSuiteSchema>;
type EvalExpectation = z.infer<typeof ExpectSchema>;
type EvalInput = z.infer<typeof InputSchema>;

export type SuiteParseResult = { ok: true; suite: EvalSuite } | { ok: false; error: string };

/** Validate an untrusted parsed-JSON value as an eval suite. Errors as values. */
export function parseEvalSuite(raw: unknown): SuiteParseResult {
  const parsed = EvalSuiteSchema.safeParse(raw);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    const where =
      firstIssue === undefined ? "" : ` at ${firstIssue.path.join(".") || "(root)"}: ${firstIssue.message}`;
    return { ok: false, error: `invalid eval suite${where}` };
  }
  return { ok: true, suite: parsed.data };
}

// What a case produced, normalized across the two input kinds so a single checker
// reads both a synthetic planned set and a decoded mainnet mint.
type Observed = {
  severity: Severity;
  score: number;
  cexBlockers: string[];
  conflicts: Conflict[];
  decodedExtensions: string[];
  // Per-extension decoded detail, populated for fixture inputs only (a planned set
  // has no decoded detail), used by the extensionDetail assertion.
  extensionDetails: Map<string, Record<string, string>>;
  // The renounce-to-remediate projection, present for mint inputs.
  remediation: Remediation | null;
};

type ObserveResult = { ok: true; observed: Observed } | { ok: false; error: string };

function observeSet(extensions: AssessedExtension[], mintAuthorities: MintAuthorityLiveness | undefined): Observed {
  const assessment = assessExtensions(extensions, mintAuthorities);
  const remediation = projectRenouncements(extensions, mintAuthorities);
  return {
    severity: assessment.posture.overallSeverity,
    score: assessment.posture.score,
    cexBlockers: assessment.posture.cexBlockers,
    conflicts: assessment.conflicts,
    decodedExtensions: extensions.map((extension) => extension.id),
    extensionDetails: new Map(),
    remediation,
  };
}

function observeFixture(name: string): ObserveResult {
  const fixture = fixtureByName(name);
  if (fixture === null) {
    return { ok: false, error: `unknown mainnet fixture: ${name}` };
  }
  const result = inspectAccount(fixtureAddress(fixture), fixtureAccountInfo(fixture));
  if (result.status !== "ok") {
    return { ok: false, error: `fixture ${name} did not decode` };
  }
  if (result.inspection.kind !== "mint") {
    return { ok: false, error: `fixture ${name} decoded as a token account, not a mint` };
  }
  const { mint, assessment, remediation } = result.inspection;
  return {
    ok: true,
    observed: {
      severity: assessment.posture.overallSeverity,
      score: assessment.posture.score,
      cexBlockers: assessment.posture.cexBlockers,
      conflicts: assessment.conflicts,
      decodedExtensions: mint.extensions.map((extension) => extension.id),
      extensionDetails: new Map(mint.extensions.map((extension) => [extension.id, extension.detail])),
      remediation,
    },
  };
}

// The catalog is the source of truth for valid extension ids. The engine silently
// skips an unknown id (so a typo'd set would score a misleading info/0); the runner
// rejects it the way the real compatibility checker does.
const KNOWN_EXTENSION_IDS: Set<string> = new Set(catalogEntries().map((entry) => entry.id));

function observe(input: EvalInput): ObserveResult {
  if (input.kind === "set") {
    const unknownIds = input.extensions
      .map((extension) => extension.id)
      .filter((extensionId) => !KNOWN_EXTENSION_IDS.has(extensionId));
    if (unknownIds.length > 0) {
      return { ok: false, error: `unknown extension id(s) in set: ${unknownIds.join(", ")}` };
    }
    return { ok: true, observed: observeSet(input.extensions, input.mintAuthorities) };
  }
  return observeFixture(input.fixture);
}

// The severity once every renounceable authority is renounced: the all-renounced
// projection when there is more than one step, the single step when there is one,
// or the current severity when nothing is renounceable.
function remediationFloor(remediation: Remediation): Severity {
  if (remediation.allRenounced !== null) {
    return remediation.allRenounced.afterSeverity;
  }
  if (remediation.steps.length === 1) {
    return remediation.steps[0].afterSeverity;
  }
  return remediation.currentSeverity;
}

function checkRemediation(
  remediation: Remediation | null,
  expectation: NonNullable<EvalExpectation["remediation"]>,
): string[] {
  const failures: string[] = [];
  if (remediation === null) {
    failures.push("remediation expected but none was produced for this input kind");
    return failures;
  }
  if (expectation.currentSeverity !== undefined && remediation.currentSeverity !== expectation.currentSeverity) {
    failures.push(`remediation.currentSeverity: expected ${expectation.currentSeverity}, got ${remediation.currentSeverity}`);
  }
  if (expectation.floorSeverity !== undefined) {
    const floor = remediationFloor(remediation);
    if (floor !== expectation.floorSeverity) {
      failures.push(`remediation floor: expected ${expectation.floorSeverity}, got ${floor}`);
    }
  }
  const expectedStep = expectation.step;
  if (expectedStep !== undefined) {
    const step = remediation.steps.find((candidate) => candidate.target === expectedStep.target);
    if (step === undefined) {
      const targets = remediation.steps.map((candidate) => candidate.target).join(", ") || "none";
      failures.push(`remediation has no step for ${expectedStep.target} (targets: ${targets})`);
    } else if (step.afterSeverity !== expectedStep.afterSeverity) {
      failures.push(`remediation step ${expectedStep.target}: expected ${expectedStep.afterSeverity}, got ${step.afterSeverity}`);
    }
  }
  return failures;
}

/** Compare an observed result to a case's expectations, returning failure lines. */
function checkExpectations(observed: Observed, expectation: EvalExpectation): string[] {
  const failures: string[] = [];

  if (expectation.severity !== undefined && observed.severity !== expectation.severity) {
    failures.push(`severity: expected ${expectation.severity}, got ${observed.severity}`);
  }
  if (expectation.score !== undefined && observed.score !== expectation.score) {
    failures.push(`score: expected ${expectation.score}, got ${observed.score}`);
  }
  for (const blocker of expectation.cexBlockersInclude ?? []) {
    if (!observed.cexBlockers.includes(blocker)) {
      failures.push(`cexBlockers should include ${blocker} (got ${formatList(observed.cexBlockers)})`);
    }
  }
  for (const blocker of expectation.cexBlockersExclude ?? []) {
    if (observed.cexBlockers.includes(blocker)) {
      failures.push(`cexBlockers should not include ${blocker} (got ${formatList(observed.cexBlockers)})`);
    }
  }
  if (expectation.cexListable !== undefined) {
    const isListable = observed.cexBlockers.length === 0;
    if (isListable !== expectation.cexListable) {
      failures.push(`cexListable: expected ${expectation.cexListable}, got ${isListable} (blockers: ${formatList(observed.cexBlockers)})`);
    }
  }
  if (expectation.conflictInitRejected !== undefined) {
    const hasInitRejected = observed.conflicts.some((conflict) => conflict.initRejected === true);
    if (hasInitRejected !== expectation.conflictInitRejected) {
      failures.push(`conflictInitRejected: expected ${expectation.conflictInitRejected}, got ${hasInitRejected}`);
    }
  }
  if (expectation.conflictTitleContains !== undefined) {
    const needle = expectation.conflictTitleContains.toLowerCase();
    const found = observed.conflicts.some((conflict) => conflict.title.toLowerCase().includes(needle));
    if (!found) {
      const titles = observed.conflicts.map((conflict) => conflict.title).join(" | ") || "none";
      failures.push(`no conflict title contains "${expectation.conflictTitleContains}" (titles: ${titles})`);
    }
  }
  for (const extensionId of expectation.decodedExtensionsInclude ?? []) {
    if (!observed.decodedExtensions.includes(extensionId)) {
      failures.push(`decoded extensions should include ${extensionId} (got ${formatList(observed.decodedExtensions)})`);
    }
  }
  if (expectation.decodedExtensionsEqual !== undefined && !arraysEqual(observed.decodedExtensions, expectation.decodedExtensionsEqual)) {
    failures.push(`decoded extensions: expected [${expectation.decodedExtensionsEqual.join(", ")}], got [${observed.decodedExtensions.join(", ")}]`);
  }
  if (expectation.noUnrecognized === true && observed.decodedExtensions.includes("unrecognized")) {
    failures.push(`decoded extensions contain "unrecognized" but should not (${formatList(observed.decodedExtensions)})`);
  }
  const detailExpect = expectation.extensionDetail;
  if (detailExpect !== undefined) {
    const detail = observed.extensionDetails.get(detailExpect.extension);
    const actual = detail?.[detailExpect.key];
    if (actual !== detailExpect.equals) {
      const shown = actual === undefined ? "(absent)" : `"${actual}"`;
      failures.push(`extension ${detailExpect.extension}.${detailExpect.key}: expected "${detailExpect.equals}", got ${shown}`);
    }
  }
  if (expectation.remediation !== undefined) {
    failures.push(...checkRemediation(observed.remediation, expectation.remediation));
  }
  return failures;
}

export type EvalCaseResult = {
  id: string;
  prompt: string;
  evalsRef: number | null;
  ok: boolean;
  failures: string[];
};

export type EvalSuiteReport = {
  total: number;
  passed: number;
  failed: number;
  // Passed cases as a percentage with one decimal place (for example 100 or 94.4).
  accuracy: number;
  results: EvalCaseResult[];
};

/** Run one case through the real engine and check its expectations. */
export function runEvalCase(evalCase: EvalCase): EvalCaseResult {
  const evalsRef = evalCase.evalsRef ?? null;
  const observed = observe(evalCase.input);
  if (!observed.ok) {
    return { id: evalCase.id, prompt: evalCase.prompt, evalsRef, ok: false, failures: [observed.error] };
  }
  const failures = checkExpectations(observed.observed, evalCase.expect);
  return { id: evalCase.id, prompt: evalCase.prompt, evalsRef, ok: failures.length === 0, failures };
}

/** Run every case in a suite and compute the accuracy. */
export function runEvalSuite(suite: EvalSuite): EvalSuiteReport {
  const results = suite.cases.map(runEvalCase);
  const passed = results.filter((result) => result.ok).length;
  const total = results.length;
  const failed = total - passed;
  // One decimal place keeps a partial pass readable (94.4%) without float noise.
  const accuracy = total === 0 ? 0 : Math.round((passed / total) * 1000) / 10;
  return { total, passed, failed, accuracy, results };
}

function arraysEqual(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}
