import { TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { Keypair } from "@solana/web3.js";
import { LiteSVM } from "litesvm";
import { describe, expect, it } from "vitest";
import { formatReport, inspectAccount } from "../src/inspect";
import {
  createClassicMint,
  createControlsMint,
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

  it("decodes a controls mint: scaled UI amount, pausable, permanent delegate, mint close", () => {
    const svm = new LiteSVM();
    const payer = fundedPayer(svm);
    const { mint, delegate } = createControlsMint(svm, payer);

    const result = inspectAccount(mint, readAccountInfo(svm, mint));
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }

    const extensionIds = result.inspection.mint.extensions.map((extension) => extension.id);
    expect(extensionIds).toContain("scaled-ui-amount");
    expect(extensionIds).toContain("pausable");
    expect(extensionIds).toContain("permanent-delegate");
    expect(extensionIds).toContain("mint-close-authority");

    const scaledUiAmount = result.inspection.mint.extensions.find((extension) => extension.id === "scaled-ui-amount");
    expect(scaledUiAmount?.detail.multiplier).toBe("2");
    const pausable = result.inspection.mint.extensions.find((extension) => extension.id === "pausable");
    expect(pausable?.detail.paused).toBe("false");
    const permanentDelegate = result.inspection.mint.extensions.find((extension) => extension.id === "permanent-delegate");
    expect(permanentDelegate?.detail.delegate).toBe(delegate.toBase58());

    // Permanent delegate is the listing blocker in this set.
    expect(result.inspection.assessment.posture.cexBlockers).toContain("permanent-delegate");
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

  it("rejects a token-program account that is not a valid mint", () => {
    const svm = new LiteSVM();
    const notAMint = Keypair.generate().publicKey;
    // A Token-2022 owned account whose data is too small to be a mint, like a
    // token account or a hook validation account pointed at by mistake.
    svm.setAccount(notAMint, {
      executable: false,
      owner: TOKEN_2022_PROGRAM_ID,
      lamports: 1_000_000,
      data: new Uint8Array(10),
      rentEpoch: 0,
    });

    const result = inspectAccount(notAMint, readAccountInfo(svm, notAMint));
    expect(result.status).toBe("error");
    if (result.status !== "error") {
      return;
    }
    expect(result.reason.kind).toBe("not-a-mint");
  });
});
