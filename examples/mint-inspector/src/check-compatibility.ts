/**
 * The check_extension_compatibility tool logic, decoupled from any transport.
 * Given a proposed set of extension ids, it validates them against the catalog
 * and runs the same risk engine the inspector uses, so an agent can vet an
 * extension set for conflicts and integration posture before writing any mint
 * code. Pure and deterministic: no IO.
 */
import { type Assessment, assessExtensions } from "./assess-risk";
import { catalogEntries } from "./extension-catalog";
import { formatAssessmentLines } from "./inspect";

export type CompatibilityInput = {
  extensions: string[];
};

export type CompatibilityResult = {
  requested: string[];
  recognized: string[];
  unrecognized: string[];
  assessment: Assessment;
};

// The catalog is the source of truth for valid extension ids.
const KNOWN_IDS: Set<string> = new Set(catalogEntries().map((entry) => entry.id));

/** Validate a proposed extension-id set and assess it for conflicts and posture. */
export function checkCompatibility(input: CompatibilityInput): CompatibilityResult {
  const requested: string[] = [];
  const recognized: string[] = [];
  const unrecognized: string[] = [];
  const seen = new Set<string>();

  for (const rawExtension of input.extensions) {
    const extensionId = rawExtension.trim().toLowerCase();
    if (extensionId.length === 0 || seen.has(extensionId)) {
      continue;
    }
    seen.add(extensionId);
    requested.push(extensionId);
    if (KNOWN_IDS.has(extensionId)) {
      recognized.push(extensionId);
    } else {
      unrecognized.push(extensionId);
    }
  }

  // Only recognized ids drive the assessment; unrecognized ones are reported back
  // so the caller can correct a typo rather than getting a silently wrong posture.
  return { requested, recognized, unrecognized, assessment: assessExtensions(recognized) };
}

/** Render a compatibility check as an aligned plain-text report. */
export function formatCompatibilityReport(result: CompatibilityResult): string {
  const lines: string[] = [];
  lines.push("Token-2022 extension compatibility check");
  lines.push(`  Requested:    ${result.requested.join(", ") || "none"}`);
  lines.push(`  Recognized:   ${result.recognized.join(", ") || "none"}`);
  if (result.unrecognized.length > 0) {
    lines.push(`  Unrecognized: ${result.unrecognized.join(", ")} (not a known extension id; check the spelling)`);
  }
  lines.push("");
  for (const line of formatAssessmentLines(result.assessment)) {
    lines.push(line);
  }
  return lines.join("\n");
}
