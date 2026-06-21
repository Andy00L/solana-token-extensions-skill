import { Keypair } from "@solana/web3.js";
import { LiteSVM } from "litesvm";
import { describe, expect, it } from "vitest";
import { attemptExtensionAfterInitMint } from "../src/build-multi-extension-mint";

const AIRDROP_LAMPORTS = 100_000_000_000n; // 100 SOL for the payer, unit: lamports

describe("Token-2022 initialization order", () => {
  it("rejects initializing a fixed mint extension after InitializeMint", () => {
    const svm = new LiteSVM();
    const payer = Keypair.generate();
    svm.airdrop(payer.publicKey, AIRDROP_LAMPORTS);

    const result = attemptExtensionAfterInitMint(svm, payer);

    expect(result.status).toBe("error");
    if (result.status !== "error") {
      return;
    }
    expect(result.reason.step).toBe("init-extension-after-mint");
    expect(result.reason.logs.length).toBeGreaterThan(0);
  });
});
