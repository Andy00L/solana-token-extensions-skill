import { Keypair } from "@solana/web3.js";
import { LiteSVM } from "litesvm";
import { describe, expect, it } from "vitest";
import { formatReport, inspectAccount } from "../src/inspect";
import {
  createClassicMint,
  createNonTransferableHookMint,
  createRichMint,
  fundedPayer,
  readAccountInfo,
} from "./fixtures";

describe("inspectAccount over real on-chain mint data", () => {
  it("decodes a multi-extension Token-2022 mint and assesses its risk", () => {
    const svm = new LiteSVM();
    const payer = fundedPayer(svm);
    const { mint, hookProgramId } = createRichMint(svm, payer);

    const result = inspectAccount(mint, readAccountInfo(svm, mint));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }

    const { mint: decoded, assessment } = result.inspection;
    expect(decoded.programKind).toBe("token-2022");
    expect(decoded.decimals).toBe(9);

    const extensionIds = decoded.extensions.map((extension) => extension.id);
    expect(extensionIds).toContain("transfer-fee");
    expect(extensionIds).toContain("transfer-hook");
    expect(extensionIds).toContain("default-account-state");
    expect(extensionIds).toContain("metadata-pointer");
    expect(extensionIds).toContain("interest-bearing");
    expect(extensionIds).toContain("token-metadata");

    const transferFee = decoded.extensions.find((extension) => extension.id === "transfer-fee");
    expect(transferFee?.detail.basisPoints).toBe("50");

    const transferHook = decoded.extensions.find((extension) => extension.id === "transfer-hook");
    expect(transferHook?.detail.programId).toBe(hookProgramId.toBase58());

    const defaultState = decoded.extensions.find((extension) => extension.id === "default-account-state");
    expect(defaultState?.detail.state).toBe("frozen");

    const tokenMetadata = decoded.extensions.find((extension) => extension.id === "token-metadata");
    expect(tokenMetadata?.detail.symbol).toBe("RISK");

    expect(assessment.posture.overallSeverity).toBe("high");
    expect(assessment.posture.cexBlockers).toContain("transfer-hook");
  });

  it("proves the Non-Transferable plus Transfer Hook conflict on a real mint", () => {
    const svm = new LiteSVM();
    const payer = fundedPayer(svm);
    const mint = createNonTransferableHookMint(svm, payer);

    const result = inspectAccount(mint, readAccountInfo(svm, mint));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }

    const conflictTitles = result.inspection.assessment.conflicts.map((conflict) => conflict.title.toLowerCase());
    expect(conflictTitles.some((title) => title.includes("logically incompatible"))).toBe(true);
  });

  it("identifies a classic SPL Token mint as having no extensions", () => {
    const svm = new LiteSVM();
    const payer = fundedPayer(svm);
    const mint = createClassicMint(svm, payer);

    const result = inspectAccount(mint, readAccountInfo(svm, mint));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }

    expect(result.inspection.mint.programKind).toBe("spl-token");
    expect(result.inspection.mint.extensions).toHaveLength(0);
    expect(result.inspection.assessment.findings).toHaveLength(0);
    expect(formatReport(result.inspection)).toContain("Classic SPL Token mint");
  });

  it("rejects an account that is not owned by a token program", () => {
    const svm = new LiteSVM();
    const payer = fundedPayer(svm);
    // payer is a System-owned, airdropped account, not a mint.
    const result = inspectAccount(payer.publicKey, readAccountInfo(svm, payer.publicKey));

    expect(result.status).toBe("error");
    if (result.status !== "error") {
      return;
    }
    expect(result.reason.kind).toBe("wrong-owner");
  });

  it("reports a missing account as not found", () => {
    const result = inspectAccount(Keypair.generate().publicKey, null);

    expect(result.status).toBe("error");
    if (result.status !== "error") {
      return;
    }
    expect(result.reason.kind).toBe("account-not-found");
  });
});
