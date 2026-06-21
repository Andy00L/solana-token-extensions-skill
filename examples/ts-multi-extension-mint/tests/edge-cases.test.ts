import { Keypair } from "@solana/web3.js";
import { LiteSVM } from "litesvm";
import { describe, expect, it } from "vitest";
import { MAX_TRANSFER_FEE, computeTransferFee, readMint } from "../src/build-multi-extension-mint";

// computeTransferFee is pure. Only the non-existent-mint read needs an SVM.
const svm = new LiteSVM();

describe("Token-2022 edge cases", () => {
  it("caps the transfer fee at the maximum", () => {
    // 2000 tokens at 0.50% would be 10 tokens, above the 5-token maximum fee.
    expect(computeTransferFee(2_000_000_000_000n)).toBe(MAX_TRANSFER_FEE);
  });

  it("floors the fee for a non-divisible amount", () => {
    // 12345 * 50 / 10000 = 61.725, floored to 61
    expect(computeTransferFee(12_345n)).toBe(61n);
  });

  it("returns a zero fee for a zero amount", () => {
    expect(computeTransferFee(0n)).toBe(0n);
  });

  it("returns null when reading a mint that does not exist", () => {
    expect(readMint(svm, Keypair.generate().publicKey)).toBeNull();
  });
});
