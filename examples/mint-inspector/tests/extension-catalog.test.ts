import { describe, expect, it } from "vitest";
import { catalogEntries, lookupExtension } from "../src/extension-catalog";

describe("extension catalog", () => {
  it("names codes the published @solana/spl-token enum omits but the interface defines", () => {
    // 16, 24, 28 are absent from the 0.4.14 JS enum; sourced from the interface.
    expect(lookupExtension(16)?.id).toBe("confidential-transfer-fee");
    expect(lookupExtension(24)?.id).toBe("confidential-mint-burn");
    expect(lookupExtension(28)?.id).toBe("permissioned-burn");
  });

  it("still names the common enum-backed codes", () => {
    // ExtensionType.TransferFeeConfig = 1, TransferHook = 14.
    expect(lookupExtension(1)?.id).toBe("transfer-fee");
    expect(lookupExtension(14)?.id).toBe("transfer-hook");
  });

  it("returns null for a code no version maps, so the decoder can mark it unrecognized", () => {
    expect(lookupExtension(60000)).toBeNull();
  });

  it("exposes every entry with a unique id", () => {
    const ids = catalogEntries().map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("confidential-transfer-fee");
  });
});
