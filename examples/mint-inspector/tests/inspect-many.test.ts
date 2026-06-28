import { type AccountInfo, Keypair, PublicKey } from "@solana/web3.js";
import { LiteSVM } from "litesvm";
import { describe, expect, it } from "vitest";
import { type MultiAccountFetcher, MAX_BATCH_SIZE, formatBatchReport, handleInspectMany } from "../src/inspect-many";
import { createClassicMint, createControlsMint, createRichMint, fundedPayer, readAccountInfo } from "./fixtures";

const DEFAULT_RPC = "https://default.example/rpc";

// Build an offline batch fetcher backed by a map of address -> account info. An
// address mapped to null returns a missing account (a not-found decode error); an
// address absent from the map also returns null, matching a real RPC for an empty
// address. The fetcher receives the whole address list in one call.
function fetcherFrom(accounts: Map<string, AccountInfo<Buffer> | null>): MultiAccountFetcher {
  return async (addresses) =>
    addresses.map((addressInput) => {
      let address: PublicKey;
      try {
        address = new PublicKey(addressInput);
      } catch {
        return { status: "error", reason: { kind: "invalid-address", value: addressInput } };
      }
      return { status: "ok", address, account: accounts.get(addressInput) ?? null };
    });
}

describe("handleInspectMany", () => {
  it("triages a portfolio worst-first with per-severity counts and a CEX-blocker tally", async () => {
    const svm = new LiteSVM();
    const payer = fundedPayer(svm);
    const { mint: richMint } = createRichMint(svm, payer); // high: active transfer hook
    const { mint: controlsMint } = createControlsMint(svm, payer); // critical: live permanent delegate
    const classicMint = createClassicMint(svm, payer); // info: classic SPL, no extensions

    const accounts = new Map<string, AccountInfo<Buffer> | null>([
      [richMint.toBase58(), readAccountInfo(svm, richMint)],
      [controlsMint.toBase58(), readAccountInfo(svm, controlsMint)],
      [classicMint.toBase58(), readAccountInfo(svm, classicMint)],
    ]);

    const output = await handleInspectMany(
      { mintAddresses: [classicMint.toBase58(), richMint.toBase58(), controlsMint.toBase58()] },
      fetcherFrom(accounts),
      DEFAULT_RPC,
    );

    expect(output.status).toBe("ok");
    if (output.status !== "ok") {
      return;
    }
    const { aggregate, verdicts } = output.report;
    expect(aggregate.total).toBe(3);
    expect(aggregate.inspected).toBe(3);
    expect(aggregate.failed).toBe(0);
    expect(aggregate.worstSeverity).toBe("critical");
    expect(aggregate.countsBySeverity.critical).toBe(1);
    expect(aggregate.countsBySeverity.high).toBe(1);
    // The classic SPL mint has no extensions, so it lands at info with no blockers.
    expect(aggregate.countsBySeverity.info).toBe(1);
    expect(aggregate.withCexBlockers).toBe(2);

    // Worst first: the critical controls mint leads, the classic mint is last.
    expect(verdicts[0].address).toBe(controlsMint.toBase58());
    expect(verdicts[0].status === "ok" && verdicts[0].severity).toBe("critical");
    expect(verdicts[2].address).toBe(classicMint.toBase58());
  });

  it("records a per-address failure as an error verdict without failing the batch", async () => {
    const svm = new LiteSVM();
    const payer = fundedPayer(svm);
    const { mint: richMint } = createRichMint(svm, payer);
    const missing = Keypair.generate().publicKey.toBase58();

    const accounts = new Map<string, AccountInfo<Buffer> | null>([
      [richMint.toBase58(), readAccountInfo(svm, richMint)],
      [missing, null],
    ]);

    const output = await handleInspectMany({ mintAddresses: [richMint.toBase58(), missing] }, fetcherFrom(accounts), DEFAULT_RPC);

    expect(output.status).toBe("ok");
    if (output.status !== "ok") {
      return;
    }
    expect(output.report.aggregate.inspected).toBe(1);
    expect(output.report.aggregate.failed).toBe(1);
    const errorVerdict = output.report.verdicts.find((verdict) => verdict.status === "error");
    expect(errorVerdict?.status === "error" && errorVerdict.reason.kind).toBe("account-not-found");
  });

  it("de-duplicates repeated addresses before fetching", async () => {
    const svm = new LiteSVM();
    const payer = fundedPayer(svm);
    const { mint: richMint } = createRichMint(svm, payer);
    const accounts = new Map<string, AccountInfo<Buffer> | null>([[richMint.toBase58(), readAccountInfo(svm, richMint)]]);

    const output = await handleInspectMany(
      { mintAddresses: [richMint.toBase58(), richMint.toBase58(), ` ${richMint.toBase58()} `] },
      fetcherFrom(accounts),
      DEFAULT_RPC,
    );

    expect(output.status).toBe("ok");
    if (output.status !== "ok") {
      return;
    }
    expect(output.report.aggregate.total).toBe(1);
    expect(output.report.aggregate.inspected).toBe(1);
  });

  it("fetches the whole batch in one round-trip, not one call per address", async () => {
    const svm = new LiteSVM();
    const payer = fundedPayer(svm);
    const { mint: richMint } = createRichMint(svm, payer);
    const { mint: controlsMint } = createControlsMint(svm, payer);
    const accounts = new Map<string, AccountInfo<Buffer> | null>([
      [richMint.toBase58(), readAccountInfo(svm, richMint)],
      [controlsMint.toBase58(), readAccountInfo(svm, controlsMint)],
    ]);
    const base = fetcherFrom(accounts);
    let calls = 0;
    let lastBatchSize = 0;
    const counting: MultiAccountFetcher = async (addresses, rpcUrl) => {
      calls += 1;
      lastBatchSize = addresses.length;
      return base(addresses, rpcUrl);
    };

    const output = await handleInspectMany(
      { mintAddresses: [richMint.toBase58(), controlsMint.toBase58()] },
      counting,
      DEFAULT_RPC,
    );

    expect(output.status).toBe("ok");
    // One call for the whole set (getMultipleAccounts), not one per address.
    expect(calls).toBe(1);
    expect(lastBatchSize).toBe(2);
  });

  it("rejects an empty batch and a batch over the size cap", async () => {
    const empty = await handleInspectMany({ mintAddresses: ["", "   "] }, fetcherFrom(new Map()), DEFAULT_RPC);
    expect(empty.status).toBe("error");
    expect(empty.status === "error" && empty.reason.kind).toBe("empty-batch");

    const tooMany = Array.from({ length: MAX_BATCH_SIZE + 1 }, () => Keypair.generate().publicKey.toBase58());
    const over = await handleInspectMany({ mintAddresses: tooMany }, fetcherFrom(new Map()), DEFAULT_RPC);
    expect(over.status).toBe("error");
    if (over.status !== "error") {
      return;
    }
    expect(over.reason.kind).toBe("too-many");
    expect(over.reason.kind === "too-many" && over.reason.max).toBe(MAX_BATCH_SIZE);
  });

  it("renders a batch text report with the aggregate and a per-address line", async () => {
    const svm = new LiteSVM();
    const payer = fundedPayer(svm);
    const { mint: controlsMint } = createControlsMint(svm, payer);
    const classicMint = createClassicMint(svm, payer);
    const accounts = new Map<string, AccountInfo<Buffer> | null>([
      [controlsMint.toBase58(), readAccountInfo(svm, controlsMint)],
      [classicMint.toBase58(), readAccountInfo(svm, classicMint)],
    ]);

    const output = await handleInspectMany(
      { mintAddresses: [controlsMint.toBase58(), classicMint.toBase58()] },
      fetcherFrom(accounts),
      DEFAULT_RPC,
    );
    expect(output.status).toBe("ok");
    if (output.status !== "ok") {
      return;
    }
    const report = formatBatchReport(output.report);
    expect(report).toContain("Token-2022 batch inspection");
    expect(report).toContain("Worst verdict:     CRITICAL");
    expect(report).toContain(controlsMint.toBase58());
    expect(report).toContain("CEX blockers: permanent-delegate");
  });
});
