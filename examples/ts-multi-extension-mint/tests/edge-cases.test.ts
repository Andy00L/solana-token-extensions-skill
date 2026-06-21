import { Keypair } from "@solana/web3.js";
import { getTransferFeeAmount } from "@solana/spl-token";
import { LiteSVM } from "litesvm";
import { describe, expect, it } from "vitest";
import {
  MAX_TRANSFER_FEE,
  associatedAccountFor,
  buildMultiExtensionMint,
  computeTransferFee,
  mintTokens,
  readMint,
  readTokenAccount,
  transferWithFee,
} from "../src/build-multi-extension-mint";

const AIRDROP_LAMPORTS = 100_000_000_000n; // 100 SOL, unit: lamports
const LARGE_AMOUNT = 2_000_000_000_000n; // 2000 tokens; 0.50% would be 10 tokens, above the 5-token cap

function fundedPayer(svm: LiteSVM): Keypair {
  const payer = Keypair.generate();
  svm.airdrop(payer.publicKey, AIRDROP_LAMPORTS);
  return payer;
}

describe("Token-2022 edge cases", () => {
  it("caps the transfer fee at the maximum for a large transfer", () => {
    const svm = new LiteSVM();
    const payer = fundedPayer(svm);
    const recipient = Keypair.generate();

    const built = buildMultiExtensionMint(svm, payer);
    expect(built.status).toBe("ok");
    if (built.status !== "ok") {
      return;
    }

    expect(mintTokens(svm, payer, built.mint, payer.publicKey, LARGE_AMOUNT).status).toBe("ok");
    expect(transferWithFee(svm, payer, built.mint, payer, recipient.publicKey, LARGE_AMOUNT).status).toBe("ok");
    expect(computeTransferFee(LARGE_AMOUNT)).toBe(MAX_TRANSFER_FEE);

    const destination = readTokenAccount(svm, associatedAccountFor(built.mint, recipient.publicKey));
    expect(destination).not.toBeNull();
    if (destination === null) {
      return;
    }
    expect(getTransferFeeAmount(destination)?.withheldAmount).toBe(MAX_TRANSFER_FEE);
    expect(destination.amount).toBe(LARGE_AMOUNT - MAX_TRANSFER_FEE);
  });

  it("floors the fee for a non-divisible amount", () => {
    // 12345 * 50 / 10000 = 61.725, floored to 61
    expect(computeTransferFee(12_345n)).toBe(61n);
  });

  it("returns a zero fee for a zero amount", () => {
    expect(computeTransferFee(0n)).toBe(0n);
  });

  it("returns null when reading a mint that does not exist", () => {
    const svm = new LiteSVM();
    expect(readMint(svm, Keypair.generate().publicKey)).toBeNull();
  });
});
