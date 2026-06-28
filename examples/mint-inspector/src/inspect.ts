/**
 * Orchestrate decode plus assess into one inspection, and render it as text.
 * Pure: takes an already-fetched account, so it runs offline and deterministic.
 */
import type { AccountInfo, PublicKey } from "@solana/web3.js";
import {
  type AccountAssessment,
  type AssessedExtension,
  type Assessment,
  type MintAuthorityLiveness,
  type Remediation,
  type Severity,
  type TransferFeeParams,
  assessExtensions,
  assessTokenAccount,
  controllingAuthorityKey,
  projectRenouncements,
} from "./assess-risk";
import { type DecodeError, type DecodedExtension, type DecodedMint, type DecodedTokenAccount, decodeTokenEntity } from "./decode-mint";
import { type FetchError, formatFetchError } from "./fetch-account";

export type Inspection =
  | { kind: "mint"; mint: DecodedMint; assessment: Assessment; remediation: Remediation }
  | { kind: "token-account"; account: DecodedTokenAccount; assessment: AccountAssessment };

export type InspectionResult =
  | { status: "ok"; inspection: Inspection }
  | { status: "error"; reason: DecodeError };

/**
 * Decode a mint or token account and assess it in one step. When currentEpoch is
 * given, the transfer fee is resolved under the two-epoch activation rule and a
 * scheduled fee change is surfaced; without it the newer fee is used.
 */
export function inspectAccount(address: PublicKey, accountInfo: AccountInfo<Buffer> | null, currentEpoch?: number): InspectionResult {
  const decoded = decodeTokenEntity(address, accountInfo, currentEpoch);
  if (decoded.status === "error") {
    return { status: "error", reason: decoded.reason };
  }
  if (decoded.entity.kind === "token-account") {
    const account = decoded.entity.account;
    const withheld =
      account.extensions.find((extension) => extension.id === "transfer-fee-amount")?.detail.withheldAmount ?? null;
    const assessment = assessTokenAccount({
      extensionIds: account.extensions.map((extension) => extension.id),
      isFrozen: account.isFrozen,
      withheldAmount: withheld,
    });
    return { status: "ok", inspection: { kind: "token-account", account, assessment } };
  }
  const mint = decoded.entity.mint;
  const assessedExtensions = mint.extensions.map(toAssessedExtension);
  // The base mint and freeze authorities are assessed only for Token-2022 mints;
  // a classic SPL mint is reported as having no Token-2022 extensions.
  const mintAuthorities: MintAuthorityLiveness | undefined =
    mint.programKind === "token-2022"
      ? {
          mintAuthorityLive: isLiveAuthorityKey(mint.mintAuthority),
          freezeAuthorityLive: isLiveAuthorityKey(mint.freezeAuthority),
        }
      : undefined;
  const assessment = assessExtensions(assessedExtensions, mintAuthorities);
  const remediation = projectRenouncements(assessedExtensions, mintAuthorities);
  return { status: "ok", inspection: { kind: "mint", mint, assessment, remediation } };
}

/** The headline verdict (severity and 0-to-100 score) of any inspection. */
export function inspectionVerdict(inspection: Inspection): { severity: Severity; score: number } {
  if (inspection.kind === "token-account") {
    return { severity: inspection.assessment.overallSeverity, score: inspection.assessment.score };
  }
  return { severity: inspection.assessment.posture.overallSeverity, score: inspection.assessment.posture.score };
}

// A compact, agent-consumable verdict: the fields another agent branches on (is it
// safe to list, route, or hold) without parsing the full inspection. Emitted as MCP
// structuredContent so a calling agent gets a typed object, not just prose.
export type InspectionSummary = {
  kind: "mint" | "token-account";
  address: string;
  severity: Severity;
  score: number;
  cexBlockers: string[];
  dexFrictions: string[];
  walletCaveats: string[];
};

/** Project any inspection to its compact, agent-consumable verdict. */
export function inspectionSummary(inspection: Inspection): InspectionSummary {
  const verdict = inspectionVerdict(inspection);
  if (inspection.kind === "mint") {
    const { posture } = inspection.assessment;
    return {
      kind: "mint",
      address: inspection.mint.address,
      severity: verdict.severity,
      score: verdict.score,
      cexBlockers: posture.cexBlockers,
      dexFrictions: posture.dexFrictions,
      walletCaveats: posture.walletCaveats,
    };
  }
  return {
    kind: "token-account",
    address: inspection.account.address,
    severity: verdict.severity,
    score: verdict.score,
    cexBlockers: [],
    dexFrictions: [],
    walletCaveats: [],
  };
}

/** A human-readable message for any fetch or decode error, shared by all callers. */
export function formatAccountError(reason: FetchError | DecodeError): string {
  switch (reason.kind) {
    case "invalid-address":
    case "rpc-failed":
      return formatFetchError(reason);
    default:
      return formatDecodeError(reason);
  }
}

/**
 * Map a decoded extension to an assessment input, deriving whether its controlling
 * authority is renounced from the decoded detail (an unset authority renders as
 * "none"). This drives conditional severity: a dormant authority is lower risk.
 */
// The all-zero key (System Program, "111...111") is not a real signer: an authority
// set to it can never sign, so it is treated as effectively renounced, distinct from
// a live key. A null is COption::None (cleanly renounced). Extension authorities use
// the zero key for "no authority" and already decode to "none"; this predicate covers
// the base mint and freeze authorities, which decode to the raw key.
// Source: spl-token SetAuthority (None) and OptionalNonZeroPubkey (zero = unset).
export const SYSTEM_PROGRAM_KEY = "11111111111111111111111111111111";

/** Whether a decoded base authority key is a live signer (not None, not the zero key). */
export function isLiveAuthorityKey(key: string | null): boolean {
  return key !== null && key !== SYSTEM_PROGRAM_KEY;
}

function toAssessedExtension(extension: DecodedExtension): AssessedExtension {
  const key = controllingAuthorityKey(extension.id);
  const assessed: AssessedExtension =
    key === null
      ? { id: extension.id }
      : { id: extension.id, authorityRenounced: extension.detail[key] === undefined || extension.detail[key] === "none" };
  if (extension.id === "transfer-fee") {
    assessed.transferFee = toTransferFeeParams(extension.detail);
  }
  return assessed;
}

/** Build the transfer-fee magnitude params from the decoded extension detail. */
function toTransferFeeParams(detail: Record<string, string>): TransferFeeParams {
  const active = Number.parseInt(detail.basisPoints ?? "0", 10);
  const scheduledRaw = detail.scheduledBasisPoints;
  const scheduled = scheduledRaw === undefined ? null : Number.parseInt(scheduledRaw, 10);
  return {
    activeBasisPoints: Number.isFinite(active) ? active : 0,
    scheduledBasisPoints: scheduled !== null && Number.isFinite(scheduled) ? scheduled : null,
  };
}

/** A human-readable decode error message. */
export function formatDecodeError(reason: DecodeError): string {
  switch (reason.kind) {
    case "account-not-found":
      return "account not found on this RPC; check the address and the cluster";
    case "wrong-owner":
      return `account is not owned by a Token program (owner: ${reason.owner}); it is not a token mint`;
    case "not-a-mint":
      return `account is not a valid token mint: ${reason.detail}`;
  }
}

/** Render an inspection as an aligned plain-text report. */
export function formatReport(inspection: Inspection): string {
  if (inspection.kind === "token-account") {
    return formatTokenAccountReport(inspection.account, inspection.assessment);
  }
  return formatMintReport(inspection.mint, inspection.assessment, inspection.remediation);
}

function formatMintReport(mint: DecodedMint, assessment: Assessment, remediation: Remediation): string {
  const lines: string[] = [];

  lines.push("Token-2022 mint inspection");
  lines.push(`  Address:          ${mint.address}`);
  lines.push(`  Program:          ${mint.programKind} (${mint.programId})`);
  lines.push(`  Decimals:         ${mint.decimals}`);
  lines.push(`  Supply (raw):     ${mint.supply}`);
  lines.push(`  Mint authority:   ${formatBaseAuthority(mint.mintAuthority, "fixed supply")}`);
  lines.push(`  Freeze authority: ${formatBaseAuthority(mint.freezeAuthority, "not freezable")}`);

  if (mint.programKind === "spl-token") {
    lines.push("");
    lines.push("Classic SPL Token mint: no Token-2022 extensions.");
    return lines.join("\n");
  }

  lines.push("");
  lines.push(`Extensions (${mint.extensions.length}):`);
  if (mint.extensions.length === 0) {
    lines.push("  none");
  }
  for (const extension of mint.extensions) {
    lines.push(`  - ${extension.label} [${extension.id}]`);
    for (const [key, value] of Object.entries(extension.detail)) {
      lines.push(`      ${key}: ${value}`);
    }
  }

  lines.push("");
  for (const line of formatAssessmentLines(assessment)) {
    lines.push(line);
  }

  for (const line of formatRemediationLines(remediation)) {
    lines.push(line);
  }

  return lines.join("\n");
}

/**
 * Render the renounce-to-remediate path, when there is one. Each line reads as
 * "renounce <authority> -> <verdict>", so the report shows not just the current
 * risk but the concrete path to lower it.
 */
function formatRemediationLines(remediation: Remediation): string[] {
  if (remediation.steps.length === 0) {
    return [];
  }
  const lines: string[] = [];
  lines.push("");
  lines.push("Remediation path (renounce a live authority to lower risk):");
  lines.push(`  current: ${remediation.currentSeverity.toUpperCase()} (risk score ${remediation.currentScore}/100)`);
  for (const step of remediation.steps) {
    lines.push(`  renounce ${step.target} -> ${step.afterSeverity.toUpperCase()} (${step.afterScore}/100)`);
  }
  if (remediation.allRenounced !== null) {
    lines.push(`  renounce all of the above -> ${remediation.allRenounced.afterSeverity.toUpperCase()} (${remediation.allRenounced.afterScore}/100)`);
  }
  return lines;
}

function formatTokenAccountReport(account: DecodedTokenAccount, assessment: AccountAssessment): string {
  const lines: string[] = [];

  lines.push("Token-2022 token account inspection");
  lines.push(`  Address:         ${account.address}`);
  lines.push(`  Program:         ${account.programKind} (${account.programId})`);
  lines.push(`  Mint:            ${account.mint}`);
  lines.push(`  Owner:           ${account.owner}`);
  lines.push(`  Amount (raw):    ${account.amount}`);
  lines.push(`  Frozen:          ${account.isFrozen}`);
  lines.push(`  Delegate:        ${account.delegate ?? "none"}`);
  lines.push(`  Close authority: ${account.closeAuthority ?? "none"}`);

  if (account.programKind === "spl-token") {
    lines.push("");
    lines.push("Classic SPL Token account: no Token-2022 extensions.");
    return lines.join("\n");
  }

  lines.push("");
  lines.push(`Extensions (${account.extensions.length}):`);
  if (account.extensions.length === 0) {
    lines.push("  none");
  }
  for (const extension of account.extensions) {
    lines.push(`  - ${extension.label} [${extension.id}]`);
    for (const [key, value] of Object.entries(extension.detail)) {
      lines.push(`      ${key}: ${value}`);
    }
  }

  lines.push("");
  lines.push(`Account verdict: ${assessment.overallSeverity.toUpperCase()} (risk score ${assessment.score}/100)`);
  lines.push(`Account findings (${assessment.findings.length}):`);
  if (assessment.findings.length === 0) {
    lines.push("  none");
  }
  for (const finding of assessment.findings) {
    lines.push(`  [${finding.severity.toUpperCase()}] ${finding.title}`);
    lines.push(`      ${finding.detail}`);
    lines.push(`      fix: ${finding.remediation}`);
    lines.push(`      source: ${finding.sourceRef}`);
  }

  return lines.join("\n");
}

/**
 * Render the findings, conflicts, and posture of an assessment as text lines.
 * Shared by the mint report and the standalone compatibility check so both keep
 * one format and the rendering logic lives in one place.
 */
export function formatAssessmentLines(assessment: Assessment): string[] {
  const lines: string[] = [];
  lines.push(`Verdict: ${assessment.posture.overallSeverity.toUpperCase()} (risk score ${assessment.posture.score}/100)`);
  lines.push(`Integration findings (${assessment.findings.length}):`);
  if (assessment.findings.length === 0) {
    lines.push("  none");
  }
  for (const finding of assessment.findings) {
    const surfaces = finding.surfaces.length === 0 ? "informational" : finding.surfaces.join(", ");
    lines.push(`  [${finding.severity.toUpperCase()}] ${finding.title} (${surfaces})`);
    lines.push(`      ${finding.detail}`);
    lines.push(`      fix: ${finding.remediation}`);
    lines.push(`      source: ${finding.sourceRef}`);
  }

  if (assessment.conflicts.length > 0) {
    lines.push("");
    lines.push(`Conflicts (${assessment.conflicts.length}):`);
    for (const conflict of assessment.conflicts) {
      lines.push(`  [${conflict.severity.toUpperCase()}] ${conflict.title}`);
      lines.push(`      ${conflict.detail}`);
      lines.push(`      source: ${conflict.sourceRef}`);
    }
  }

  lines.push("");
  lines.push("Posture:");
  lines.push(`  CEX listing blockers:  ${formatList(assessment.posture.cexBlockers)}`);
  lines.push(`  DEX routing frictions: ${formatList(assessment.posture.dexFrictions)}`);
  lines.push(`  Wallet caveats:        ${formatList(assessment.posture.walletCaveats)}`);
  return lines;
}

/** Render a string list as a comma-separated line, or "none" when empty. */
export function formatList(values: string[]): string {
  return values.length === 0 ? "none" : values.join(", ");
}

// Render a base mint or freeze authority, distinguishing None, the zero/System key
// (effectively renounced, no signer), and a live key.
function formatBaseAuthority(key: string | null, noneNote: string): string {
  if (key === null) {
    return `none (${noneNote})`;
  }
  if (key === SYSTEM_PROGRAM_KEY) {
    return `${key} (System Program, no signer: effectively renounced)`;
  }
  return key;
}
