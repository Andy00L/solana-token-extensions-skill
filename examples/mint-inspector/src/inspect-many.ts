/**
 * Batch ("portfolio") inspection: decode and assess many mints or token accounts
 * in one call, returning a per-address verdict and an aggregate roll-up. Built for
 * triage of a listing set or a holdings list, where the question is "which of
 * these carry a listing blocker" rather than the full report for one mint.
 *
 * The per-address fetch is the only IO; it reuses the tested handleInspectMint
 * core, so a single mint inspects identically whether called alone or in a batch.
 * A per-address fetch or decode failure becomes an error verdict inside the report
 * rather than failing the whole batch: one bad address must not blind the triage.
 * Only a top-level input problem (empty set, over the cap) is a batch-level error.
 */
import { type Severity, severityRank } from "./assess-risk";
import type { DecodeError } from "./decode-mint";
import type { FetchError } from "./fetch-account";
import { type Inspection, formatAccountError, inspectionVerdict } from "./inspect";
import { type AccountFetcher, handleInspectMint } from "./mcp-tool";

// A read-only triage tool: cap the addresses per call so one request cannot fan
// out into an unbounded number of RPC calls. 50 covers a typical listing set;
// larger sets should be chunked by the caller. Source: this tool's rate policy.
export const MAX_BATCH_SIZE = 50;

export type BatchVerdict =
  | {
      address: string;
      status: "ok";
      kind: "mint" | "token-account";
      severity: Severity;
      score: number;
      cexBlockers: string[];
      inspection: Inspection;
    }
  | {
      address: string;
      status: "error";
      reason: FetchError | DecodeError;
    };

export type BatchAggregate = {
  // Distinct addresses processed (after trimming and de-duplication).
  total: number;
  inspected: number;
  failed: number;
  // The worst severity across the inspected addresses, "info" when none inspect.
  worstSeverity: Severity;
  countsBySeverity: Record<Severity, number>;
  // How many inspected mints carry at least one CEX listing blocker.
  withCexBlockers: number;
};

export type BatchReport = {
  aggregate: BatchAggregate;
  verdicts: BatchVerdict[];
};

export type BatchInputError =
  | { kind: "empty-batch" }
  | { kind: "too-many"; count: number; max: number };

export type InspectManyInput = {
  mintAddresses: string[];
  rpcUrl?: string;
  // Current epoch, threaded to each inspection for active-transfer-fee resolution.
  currentEpoch?: number;
};

export type InspectManyOutput =
  | { status: "ok"; report: BatchReport }
  | { status: "error"; reason: BatchInputError };

/** Trim, drop blanks, and de-duplicate the requested addresses, preserving order. */
function normalizeAddresses(addresses: string[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const rawAddress of addresses) {
    const trimmed = rawAddress.trim();
    if (trimmed.length === 0 || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    cleaned.push(trimmed);
  }
  return cleaned;
}

function cexBlockersOf(inspection: Inspection): string[] {
  return inspection.kind === "mint" ? inspection.assessment.posture.cexBlockers : [];
}

/** Roll a set of per-address verdicts up into the aggregate summary. Pure. */
function aggregateVerdicts(verdicts: BatchVerdict[]): BatchAggregate {
  const countsBySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  let inspected = 0;
  let failed = 0;
  let withCexBlockers = 0;
  let worstSeverity: Severity = "info";

  for (const verdict of verdicts) {
    if (verdict.status === "error") {
      failed += 1;
      continue;
    }
    inspected += 1;
    countsBySeverity[verdict.severity] += 1;
    if (verdict.cexBlockers.length > 0) {
      withCexBlockers += 1;
    }
    if (severityRank(verdict.severity) > severityRank(worstSeverity)) {
      worstSeverity = verdict.severity;
    }
  }

  return { total: verdicts.length, inspected, failed, worstSeverity, countsBySeverity, withCexBlockers };
}

// Worst first: by severity, then by score, then by address for a stable order.
// Error verdicts sort last (rank below info).
function sortVerdicts(verdicts: BatchVerdict[]): BatchVerdict[] {
  const rankOf = (verdict: BatchVerdict): number => (verdict.status === "ok" ? severityRank(verdict.severity) : -1);
  const scoreOf = (verdict: BatchVerdict): number => (verdict.status === "ok" ? verdict.score : -1);
  return [...verdicts].sort((left, right) => {
    if (rankOf(left) !== rankOf(right)) {
      return rankOf(right) - rankOf(left);
    }
    if (scoreOf(left) !== scoreOf(right)) {
      return scoreOf(right) - scoreOf(left);
    }
    return left.address.localeCompare(right.address);
  });
}

/**
 * Inspect many addresses through an injected fetcher. Returns a batch-level error
 * only for an empty set or one over MAX_BATCH_SIZE; per-address failures are
 * reported as error verdicts inside the report.
 */
export async function handleInspectMany(
  input: InspectManyInput,
  fetchAccount: AccountFetcher,
  defaultRpcUrl: string,
): Promise<InspectManyOutput> {
  const addresses = normalizeAddresses(input.mintAddresses);
  if (addresses.length === 0) {
    return { status: "error", reason: { kind: "empty-batch" } };
  }
  if (addresses.length > MAX_BATCH_SIZE) {
    return { status: "error", reason: { kind: "too-many", count: addresses.length, max: MAX_BATCH_SIZE } };
  }

  const verdicts: BatchVerdict[] = [];
  for (const address of addresses) {
    // Sequential by design: an injected fetcher in tests is deterministic, and a
    // real RPC is friendlier to rate limits one request at a time for this size.
    const output = await handleInspectMint(
      { mintAddress: address, rpcUrl: input.rpcUrl, currentEpoch: input.currentEpoch },
      fetchAccount,
      defaultRpcUrl,
    );
    if (output.status === "error") {
      verdicts.push({ address, status: "error", reason: output.reason });
      continue;
    }
    const verdict = inspectionVerdict(output.inspection);
    verdicts.push({
      address,
      status: "ok",
      kind: output.inspection.kind,
      severity: verdict.severity,
      score: verdict.score,
      cexBlockers: cexBlockersOf(output.inspection),
      inspection: output.inspection,
    });
  }

  const sorted = sortVerdicts(verdicts);
  return { status: "ok", report: { aggregate: aggregateVerdicts(sorted), verdicts: sorted } };
}

// A compact, agent-consumable projection of a batch report: the aggregate plus a
// flat per-address verdict list, without the nested full inspections. Emitted as MCP
// structuredContent.
export type BatchSummaryVerdict = {
  address: string;
  status: "ok" | "error";
  severity?: Severity;
  score?: number;
  cexBlockers?: string[];
};

export type BatchSummary = {
  total: number;
  inspected: number;
  failed: number;
  worstSeverity: Severity;
  withCexBlockers: number;
  verdicts: BatchSummaryVerdict[];
};

/** Project a batch report to its compact, agent-consumable summary. */
export function batchSummary(report: BatchReport): BatchSummary {
  const { aggregate } = report;
  return {
    total: aggregate.total,
    inspected: aggregate.inspected,
    failed: aggregate.failed,
    worstSeverity: aggregate.worstSeverity,
    withCexBlockers: aggregate.withCexBlockers,
    verdicts: report.verdicts.map((verdict) =>
      verdict.status === "ok"
        ? {
            address: verdict.address,
            status: "ok",
            severity: verdict.severity,
            score: verdict.score,
            cexBlockers: verdict.cexBlockers,
          }
        : { address: verdict.address, status: "error" },
    ),
  };
}

/** A human-readable message for a batch-level input error. */
export function formatBatchInputError(reason: BatchInputError): string {
  switch (reason.kind) {
    case "empty-batch":
      return "provide at least one address to inspect";
    case "too-many":
      return `too many addresses: ${reason.count} (max ${reason.max}); split the set into smaller batches`;
  }
}

/** Render a batch report as an aligned plain-text summary plus a per-address list. */
export function formatBatchReport(report: BatchReport): string {
  const { aggregate } = report;
  const lines: string[] = [];
  lines.push("Token-2022 batch inspection");
  lines.push(`  Addresses:         ${aggregate.total}`);
  lines.push(`  Inspected:         ${aggregate.inspected}`);
  lines.push(`  Failed:            ${aggregate.failed}`);
  lines.push(`  Worst verdict:     ${aggregate.worstSeverity.toUpperCase()}`);
  lines.push(`  With CEX blockers: ${aggregate.withCexBlockers}`);
  lines.push(
    `  By severity:       critical ${aggregate.countsBySeverity.critical}, high ${aggregate.countsBySeverity.high}, medium ${aggregate.countsBySeverity.medium}, low ${aggregate.countsBySeverity.low}, info ${aggregate.countsBySeverity.info}`,
  );
  lines.push("");
  lines.push("Per address (worst first):");
  for (const verdict of report.verdicts) {
    if (verdict.status === "error") {
      lines.push(`  [ERROR] ${verdict.address}: ${formatAccountError(verdict.reason)}`);
      continue;
    }
    const blockers =
      verdict.cexBlockers.length === 0 ? "no CEX blockers" : `CEX blockers: ${verdict.cexBlockers.join(", ")}`;
    lines.push(`  [${verdict.severity.toUpperCase()} ${verdict.score}/100] ${verdict.address} (${verdict.kind}; ${blockers})`);
  }
  return lines.join("\n");
}
