/**
 * Orchestrate decode plus assess into one inspection, and render it as text.
 * Pure: takes an already-fetched account, so it runs offline and deterministic.
 */
import type { AccountInfo, PublicKey } from "@solana/web3.js";
import { type AccountAssessment, type Assessment, assessExtensions, assessTokenAccount } from "./assess-risk";
import { type DecodeError, type DecodedMint, type DecodedTokenAccount, decodeTokenEntity } from "./decode-mint";

export type Inspection =
  | { kind: "mint"; mint: DecodedMint; assessment: Assessment }
  | { kind: "token-account"; account: DecodedTokenAccount; assessment: AccountAssessment };

export type InspectionResult =
  | { status: "ok"; inspection: Inspection }
  | { status: "error"; reason: DecodeError };

/** Decode a mint or token account and assess it in one step. */
export function inspectAccount(address: PublicKey, accountInfo: AccountInfo<Buffer> | null): InspectionResult {
  const decoded = decodeTokenEntity(address, accountInfo);
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
  const assessment = assessExtensions(mint.extensions.map((extension) => extension.id));
  return { status: "ok", inspection: { kind: "mint", mint, assessment } };
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
  return formatMintReport(inspection.mint, inspection.assessment);
}

function formatMintReport(mint: DecodedMint, assessment: Assessment): string {
  const lines: string[] = [];

  lines.push("Token-2022 mint inspection");
  lines.push(`  Address:          ${mint.address}`);
  lines.push(`  Program:          ${mint.programKind} (${mint.programId})`);
  lines.push(`  Decimals:         ${mint.decimals}`);
  lines.push(`  Supply (raw):     ${mint.supply}`);
  lines.push(`  Mint authority:   ${mint.mintAuthority ?? "none (fixed supply)"}`);
  lines.push(`  Freeze authority: ${mint.freezeAuthority ?? "none"}`);

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

  return lines.join("\n");
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
  lines.push(`Account findings (${assessment.findings.length}), overall severity: ${assessment.overallSeverity}`);
  if (assessment.findings.length === 0) {
    lines.push("  none");
  }
  for (const finding of assessment.findings) {
    lines.push(`  [${finding.severity.toUpperCase()}] ${finding.title}`);
    lines.push(`      ${finding.detail}`);
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
  lines.push(`Integration findings (${assessment.findings.length}), overall severity: ${assessment.posture.overallSeverity}`);
  if (assessment.findings.length === 0) {
    lines.push("  none");
  }
  for (const finding of assessment.findings) {
    const surfaces = finding.surfaces.length === 0 ? "informational" : finding.surfaces.join(", ");
    lines.push(`  [${finding.severity.toUpperCase()}] ${finding.title} (${surfaces})`);
    lines.push(`      ${finding.detail}`);
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

function formatList(values: string[]): string {
  return values.length === 0 ? "none" : values.join(", ");
}
