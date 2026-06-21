import { describe, expect, it } from "vitest";
import { assessExtensions } from "../src/assess-risk";

describe("assessExtensions", () => {
  it("flags transfer hook and permanent delegate as CEX blockers, fee as friction", () => {
    const assessment = assessExtensions(["transfer-hook", "permanent-delegate", "transfer-fee"]);

    expect(assessment.findings).toHaveLength(3);
    expect(assessment.posture.overallSeverity).toBe("high");
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
});
