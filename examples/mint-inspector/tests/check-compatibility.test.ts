import { describe, expect, it } from "vitest";
import { checkCompatibility, formatCompatibilityReport } from "../src/check-compatibility";

describe("checkCompatibility", () => {
  it("flags the scaled-ui-amount plus interest-bearing init rejection as a high conflict", () => {
    const result = checkCompatibility({ extensions: ["scaled-ui-amount", "interest-bearing"] });

    expect(result.recognized).toEqual(["scaled-ui-amount", "interest-bearing"]);
    expect(result.assessment.conflicts).toHaveLength(1);
    expect(result.assessment.conflicts[0].severity).toBe("high");
    expect(result.assessment.conflicts[0].title.toLowerCase()).toContain("rejected at init");
  });

  it("separates unrecognized ids from recognized ones and lowercases input", () => {
    const result = checkCompatibility({ extensions: ["transfer-fee", "made-up", "TRANSFER-HOOK"] });

    expect(result.recognized).toEqual(["transfer-fee", "transfer-hook"]);
    expect(result.unrecognized).toEqual(["made-up"]);
  });

  it("dedupes and trims the requested set", () => {
    const result = checkCompatibility({ extensions: ["transfer-fee", " transfer-fee ", "transfer-fee"] });

    expect(result.requested).toEqual(["transfer-fee"]);
    expect(result.recognized).toEqual(["transfer-fee"]);
  });

  it("returns an informational posture for a metadata-only set", () => {
    const result = checkCompatibility({ extensions: ["metadata-pointer", "token-metadata"] });

    expect(result.assessment.posture.overallSeverity).toBe("info");
    expect(result.assessment.conflicts).toHaveLength(0);
  });

  it("renders a text report naming the requested set and the posture", () => {
    const report = formatCompatibilityReport(checkCompatibility({ extensions: ["transfer-hook"] }));

    expect(report).toContain("extension compatibility check");
    expect(report).toContain("transfer-hook");
    expect(report).toContain("Posture:");
  });
});
