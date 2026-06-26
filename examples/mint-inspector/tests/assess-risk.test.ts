import { describe, expect, it } from "vitest";
import { assessExtensions, assessTokenAccount } from "../src/assess-risk";

describe("assessExtensions", () => {
  it("flags transfer hook and permanent delegate as CEX blockers, fee as friction", () => {
    const assessment = assessExtensions(["transfer-hook", "permanent-delegate", "transfer-fee"]);

    expect(assessment.findings).toHaveLength(3);
    // A live permanent delegate is the marquee fund-loss extension: critical.
    expect(assessment.posture.overallSeverity).toBe("critical");
    expect(assessment.posture.cexBlockers).toContain("transfer-hook");
    expect(assessment.posture.cexBlockers).toContain("permanent-delegate");
    // Transfer fee is integration friction, not a listing blocker.
    expect(assessment.posture.cexBlockers).not.toContain("transfer-fee");
    expect(assessment.posture.dexFrictions).toContain("transfer-fee");
  });

  it("detects the Non-Transferable plus Transfer Hook conflict", () => {
    const assessment = assessExtensions(["non-transferable", "transfer-hook"]);

    expect(assessment.conflicts).toHaveLength(1);
    const conflict = assessment.conflicts[0];
    expect(conflict.extensions).toEqual(["non-transferable", "transfer-hook"]);
    expect(conflict.severity).toBe("high");
    expect(conflict.title.toLowerCase()).toContain("logically incompatible");
  });

  it("treats confidential transfer as a high-severity CEX blocker", () => {
    const assessment = assessExtensions(["confidential-transfer"]);

    expect(assessment.findings[0].severity).toBe("high");
    expect(assessment.posture.cexBlockers).toContain("confidential-transfer");
  });

  it("returns an informational posture for a metadata-only mint", () => {
    const assessment = assessExtensions(["metadata-pointer", "token-metadata"]);

    expect(assessment.posture.overallSeverity).toBe("info");
    expect(assessment.posture.cexBlockers).toHaveLength(0);
    expect(assessment.conflicts).toHaveLength(0);
  });

  it("returns empty results for a mint with no extensions", () => {
    const assessment = assessExtensions([]);

    expect(assessment.findings).toHaveLength(0);
    expect(assessment.conflicts).toHaveLength(0);
    expect(assessment.posture.overallSeverity).toBe("info");
    expect(assessment.posture.cexBlockers).toHaveLength(0);
  });

  it("surfaces a low finding for an unrecognized extension", () => {
    const assessment = assessExtensions(["unrecognized"]);

    expect(assessment.findings).toHaveLength(1);
    expect(assessment.findings[0].severity).toBe("low");
  });

  it("treats confidential transfer with a hook as a low caveat, not a high conflict", () => {
    const assessment = assessExtensions(["confidential-transfer", "transfer-hook"]);

    const conflict = assessment.conflicts.find((entry) => entry.extensions.includes("confidential-transfer"));
    expect(conflict?.severity).toBe("low");
    expect(conflict?.title.toLowerCase()).toContain("no real amount");
  });

  it("flags scaled UI amount with interest-bearing as a high init-rejection conflict", () => {
    const assessment = assessExtensions(["scaled-ui-amount", "interest-bearing"]);

    expect(assessment.conflicts).toHaveLength(1);
    expect(assessment.conflicts[0].severity).toBe("high");
    expect(assessment.posture.overallSeverity).toBe("high");
  });

  it("surfaces a low cex finding for the permissioned-burn extension", () => {
    const assessment = assessExtensions(["permissioned-burn"]);

    expect(assessment.findings).toHaveLength(1);
    expect(assessment.findings[0].severity).toBe("low");
    expect(assessment.posture.cexBlockers).toHaveLength(0);
  });

  it("downgrades a permanent delegate to low when its delegate authority is renounced", () => {
    const live = assessExtensions([{ id: "permanent-delegate", authorityRenounced: false }]);
    expect(live.findings[0].severity).toBe("critical");
    expect(live.posture.cexBlockers).toContain("permanent-delegate");

    const renounced = assessExtensions([{ id: "permanent-delegate", authorityRenounced: true }]);
    expect(renounced.findings[0].severity).toBe("low");
    expect(renounced.posture.overallSeverity).toBe("low");
    expect(renounced.posture.cexBlockers).not.toContain("permanent-delegate");
  });

  it("treats a hook with no program as a medium latent caveat and an active hook as a high blocker", () => {
    const noProgram = assessExtensions([{ id: "transfer-hook", authorityRenounced: true }]);
    expect(noProgram.findings[0].severity).toBe("medium");
    expect(noProgram.posture.cexBlockers).not.toContain("transfer-hook");

    const active = assessExtensions([{ id: "transfer-hook", authorityRenounced: false }]);
    expect(active.findings[0].severity).toBe("high");
    expect(active.posture.cexBlockers).toContain("transfer-hook");
  });

  it("locks a transfer fee to low severity when the fee-config authority is renounced", () => {
    const live = assessExtensions([{ id: "transfer-fee", authorityRenounced: false }]);
    expect(live.findings[0].severity).toBe("medium");
    const locked = assessExtensions([{ id: "transfer-fee", authorityRenounced: true }]);
    expect(locked.findings[0].severity).toBe("low");
  });

  it("gives every finding a concrete remediation and a 0-to-100 risk score", () => {
    const assessment = assessExtensions(["permanent-delegate", "transfer-fee"]);
    for (const finding of assessment.findings) {
      expect(finding.remediation.length).toBeGreaterThan(0);
    }
    // A live permanent delegate saturates the score.
    expect(assessment.posture.score).toBe(100);
    const calm = assessExtensions(["metadata-pointer", "token-metadata"]);
    expect(calm.posture.score).toBe(0);
  });

  it("adds base mint and freeze authority findings when authority liveness is known", () => {
    const live = assessExtensions(["metadata-pointer"], { mintAuthorityLive: true, freezeAuthorityLive: true });
    const ids = live.findings.map((finding) => finding.extension);
    expect(ids).toContain("mint-authority");
    expect(ids).toContain("freeze-authority");

    const fixed = assessExtensions(["metadata-pointer"], { mintAuthorityLive: false, freezeAuthorityLive: false });
    const fixedMint = fixed.findings.find((finding) => finding.extension === "mint-authority");
    expect(fixedMint?.severity).toBe("info");
    expect(fixed.findings.some((finding) => finding.extension === "freeze-authority")).toBe(false);
  });

  it("flags a frozen token account holding withheld fees as high severity", () => {
    const assessment = assessTokenAccount({
      extensionIds: ["transfer-fee-amount", "immutable-owner"],
      isFrozen: true,
      withheldAmount: "5000000",
    });

    expect(assessment.overallSeverity).toBe("high");
    expect(assessment.findings.some((finding) => finding.title.toLowerCase().includes("frozen"))).toBe(true);
    expect(assessment.findings.some((finding) => finding.title.toLowerCase().includes("withheld"))).toBe(true);
  });

  it("notes cpi guard and required memo on a healthy token account", () => {
    const assessment = assessTokenAccount({
      extensionIds: ["cpi-guard", "required-memo-on-transfer", "immutable-owner"],
      isFrozen: false,
      withheldAmount: null,
    });

    expect(assessment.overallSeverity).toBe("low");
    const titles = assessment.findings.map((finding) => finding.title);
    expect(titles.some((title) => title.includes("CPI Guard"))).toBe(true);
    expect(titles.some((title) => title.toLowerCase().includes("memo"))).toBe(true);
  });
});
