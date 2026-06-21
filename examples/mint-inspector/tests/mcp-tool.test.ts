import { Keypair } from "@solana/web3.js";
import { LiteSVM } from "litesvm";
import { describe, expect, it } from "vitest";
import type { AccountFetcher } from "../src/mcp-tool";
import { handleInspectMint } from "../src/mcp-tool";
import { createRichMint, fundedPayer, readAccountInfo } from "./fixtures";

const DEFAULT_RPC = "https://default.example/rpc";

describe("handleInspectMint", () => {
  it("inspects a mint supplied by an injected fetcher, with no network", async () => {
    const svm = new LiteSVM();
    const payer = fundedPayer(svm);
    const { mint } = createRichMint(svm, payer);
    const account = readAccountInfo(svm, mint);

    const fetcher: AccountFetcher = async () => ({ status: "ok", address: mint, account });
    const output = await handleInspectMint({ mintAddress: mint.toBase58() }, fetcher, DEFAULT_RPC);

    expect(output.status).toBe("ok");
    if (output.status !== "ok") {
      return;
    }
    expect(output.inspection.mint.programKind).toBe("token-2022");
    expect(output.inspection.assessment.posture.cexBlockers).toContain("transfer-hook");
  });

  it("passes a fetch error through as a typed error", async () => {
    const fetcher: AccountFetcher = async (addressInput) => ({
      status: "error",
      reason: { kind: "invalid-address", value: addressInput },
    });

    const output = await handleInspectMint({ mintAddress: "not-base58" }, fetcher, DEFAULT_RPC);

    expect(output.status).toBe("error");
    if (output.status !== "error") {
      return;
    }
    expect(output.reason.kind).toBe("invalid-address");
  });

  it("maps a missing account to a not-found decode error", async () => {
    const fetcher: AccountFetcher = async () => ({
      status: "ok",
      address: Keypair.generate().publicKey,
      account: null,
    });

    const output = await handleInspectMint({ mintAddress: Keypair.generate().publicKey.toBase58() }, fetcher, DEFAULT_RPC);

    expect(output.status).toBe("error");
    if (output.status !== "error") {
      return;
    }
    expect(output.reason.kind).toBe("account-not-found");
  });

  it("uses the default RPC url unless the caller overrides it", async () => {
    let seenRpcUrl = "";
    const recordingFetcher: AccountFetcher = async (_addressInput, rpcUrl) => {
      seenRpcUrl = rpcUrl;
      return { status: "ok", address: Keypair.generate().publicKey, account: null };
    };
    const someAddress = Keypair.generate().publicKey.toBase58();

    await handleInspectMint({ mintAddress: someAddress }, recordingFetcher, DEFAULT_RPC);
    expect(seenRpcUrl).toBe(DEFAULT_RPC);

    await handleInspectMint({ mintAddress: someAddress, rpcUrl: "https://custom.example" }, recordingFetcher, DEFAULT_RPC);
    expect(seenRpcUrl).toBe("https://custom.example");
  });
});
