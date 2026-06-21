import { Keypair } from "@solana/web3.js";
import {
  ExtensionType,
  getExtensionData,
  getExtensionTypes,
  getInterestBearingMintConfigState,
  getTransferFeeAmount,
  getTransferFeeConfig,
} from "@solana/spl-token";
import { unpack } from "@solana/spl-token-metadata";
import { LiteSVM } from "litesvm";
import { describe, expect, it } from "vitest";
import {
  DEMO_METADATA_FIELD,
  DEMO_METADATA_VALUE,
  INTEREST_RATE_BASIS_POINTS,
  TRANSFER_FEE_BASIS_POINTS,
  associatedAccountFor,
  buildMultiExtensionMint,
  computeTransferFee,
  mintTokens,
  readMint,
  readTokenAccount,
  transferWithFee,
  withdrawWithheldFees,
} from "../src/build-multi-extension-mint";

const AIRDROP_LAMPORTS = 100_000_000_000n; // 100 SOL for the payer, unit: lamports
const MINT_AMOUNT = 1_000_000_000n; // 1 token at 9 decimals, unit: base units
const TRANSFER_AMOUNT = 1_000_000_000n; // 1 token, unit: base units

function fundedPayer(svm: LiteSVM): Keypair {
  const payer = Keypair.generate();
  svm.airdrop(payer.publicKey, AIRDROP_LAMPORTS);
  return payer;
}

describe("multi-extension Token-2022 mint", () => {
  it("creates a mint carrying four extensions and readable metadata", () => {
    const svm = new LiteSVM();
    const payer = fundedPayer(svm);

    const built = buildMultiExtensionMint(svm, payer);
    expect(built.status).toBe("ok");
    if (built.status !== "ok") {
      return;
    }

    const mint = readMint(svm, built.mint);
    expect(mint).not.toBeNull();
    if (mint === null) {
      return;
    }

    const extensions = getExtensionTypes(mint.tlvData);
    expect(extensions).toContain(ExtensionType.TransferFeeConfig);
    expect(extensions).toContain(ExtensionType.MetadataPointer);
    expect(extensions).toContain(ExtensionType.InterestBearingConfig);
    expect(extensions).toContain(ExtensionType.TokenMetadata);

    const feeConfig = getTransferFeeConfig(mint);
    expect(feeConfig).not.toBeNull();
    expect(feeConfig?.newerTransferFee.transferFeeBasisPoints).toBe(TRANSFER_FEE_BASIS_POINTS);

    const interest = getInterestBearingMintConfigState(mint);
    expect(interest?.currentRate).toBe(INTEREST_RATE_BASIS_POINTS);

    const metadataData = getExtensionData(ExtensionType.TokenMetadata, mint.tlvData);
    expect(metadataData).not.toBeNull();
    if (metadataData === null) {
      return;
    }
    const metadata = unpack(metadataData);
    expect(metadata.name).toBe("Demo Extension Token");
    expect(metadata.symbol).toBe("DEXT");
    expect(metadata.additionalMetadata).toContainEqual([DEMO_METADATA_FIELD, DEMO_METADATA_VALUE]);
  });

  it("withholds the transfer fee on receive and withdraws it to a collector", () => {
    const svm = new LiteSVM();
    const payer = fundedPayer(svm);
    const recipient = Keypair.generate();

    const built = buildMultiExtensionMint(svm, payer);
    expect(built.status).toBe("ok");
    if (built.status !== "ok") {
      return;
    }
    const mint = built.mint;

    expect(mintTokens(svm, payer, mint, payer.publicKey, MINT_AMOUNT).status).toBe("ok");
    expect(transferWithFee(svm, payer, mint, payer, recipient.publicKey, TRANSFER_AMOUNT).status).toBe("ok");

    const expectedFee = computeTransferFee(TRANSFER_AMOUNT);
    const recipientAccount = associatedAccountFor(mint, recipient.publicKey);
    const recipientState = readTokenAccount(svm, recipientAccount);
    expect(recipientState).not.toBeNull();
    if (recipientState === null) {
      return;
    }
    expect(recipientState.amount).toBe(TRANSFER_AMOUNT - expectedFee);
    expect(getTransferFeeAmount(recipientState)?.withheldAmount).toBe(expectedFee);

    expect(withdrawWithheldFees(svm, payer, mint, payer.publicKey, [recipientAccount]).status).toBe("ok");

    const collectorAccount = associatedAccountFor(mint, payer.publicKey);
    const collectorState = readTokenAccount(svm, collectorAccount);
    expect(collectorState).not.toBeNull();
    if (collectorState === null) {
      return;
    }
    expect(collectorState.amount).toBe(expectedFee);

    const recipientAfter = readTokenAccount(svm, recipientAccount);
    expect(recipientAfter).not.toBeNull();
    if (recipientAfter === null) {
      return;
    }
    expect(getTransferFeeAmount(recipientAfter)?.withheldAmount).toBe(0n);
  });
});
