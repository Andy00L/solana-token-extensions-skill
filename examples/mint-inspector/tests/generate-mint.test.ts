import { describe, expect, it } from "vitest";
import { formatGenerateReport, generateMintScaffold, generateMintSummary } from "../src/generate-mint";

describe("generateMintScaffold", () => {
  it("generates an ordered, sized scaffold for a legal extension set", () => {
    const result = generateMintScaffold({ extensions: ["transfer-fee", "metadata-pointer", "token-metadata"], decimals: 6 });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    expect(result.scaffoldable).toEqual(["transfer-fee", "metadata-pointer", "token-metadata"]);
    expect(result.decimals).toBe(6);

    // Init order is load-bearing: fixed extensions initialize before InitializeMint,
    // token metadata after it.
    const initMintIndex = result.steps.findIndex((step) => step.phase === "init-mint");
    const feeIndex = result.steps.findIndex((step) => step.instruction === "createInitializeTransferFeeConfigInstruction");
    const metadataIndex = result.steps.findIndex((step) => step.instruction === "createInitializeMetadataInstruction");
    expect(feeIndex).toBeGreaterThanOrEqual(0);
    expect(feeIndex).toBeLessThan(initMintIndex);
    expect(metadataIndex).toBeGreaterThan(initMintIndex);

    // The emitted code uses the real instruction builders, getMintLen over the fixed
    // set only, and the metadata module for the variable-length extension.
    expect(result.code).toContain("const extensionTypes = [ExtensionType.TransferFeeConfig, ExtensionType.MetadataPointer];");
    expect(result.code).toContain("getMintLen(extensionTypes)");
    expect(result.code).toContain("createInitializeMint2Instruction(mint, DECIMALS");
    expect(result.code).toContain("createInitializeMetadataInstruction(");
    expect(result.code).toContain("@solana/spl-token-metadata");
  });

  it("refuses to scaffold a runtime-rejected combination", () => {
    const result = generateMintScaffold({ extensions: ["scaled-ui-amount", "interest-bearing"] });
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") {
      return;
    }
    expect(result.reason).toBe("illegal-combination");
  });

  it("refuses an unrecognized extension id rather than emitting wrong code", () => {
    const result = generateMintScaffold({ extensions: ["transfer-fee", "made-up"] });
    expect(result.status).toBe("rejected");
    if (result.status !== "rejected") {
      return;
    }
    expect(result.reason).toBe("unrecognized-extension");
  });

  it("lists a recognized-but-unsupported extension instead of dropping it silently", () => {
    // permanent-delegate is scaffoldable; confidential-transfer is recognized but has
    // no scaffold spec, and the pair is not a runtime-rejected combination.
    const result = generateMintScaffold({ extensions: ["permanent-delegate", "confidential-transfer"] });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    expect(result.unsupported).toContain("confidential-transfer");
    expect(result.scaffoldable).toContain("permanent-delegate");
    expect(result.code).toContain("add these recognized extensions manually");
  });

  it("defaults decimals to 9 and projects a compact summary", () => {
    const result = generateMintScaffold({ extensions: ["permanent-delegate"] });
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    expect(result.decimals).toBe(9);
    const summary = generateMintSummary(result);
    expect(summary).toMatchObject({ status: "ok", scaffoldable: ["permanent-delegate"], stepCount: result.steps.length });
  });

  it("renders a rejection report without any code", () => {
    const report = formatGenerateReport(generateMintScaffold({ extensions: ["scaled-ui-amount", "interest-bearing"] }));
    expect(report).toContain("REJECTED");
    expect(report).not.toContain("SystemProgram.createAccount");
  });
});
