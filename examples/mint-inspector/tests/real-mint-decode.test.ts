import { PublicKey } from "@solana/web3.js";
import { describe, expect, it } from "vitest";
import { resolveActiveFee } from "../src/decode-mint";
import { inspectAccount, inspectionSummary, isLiveAuthorityKey } from "../src/inspect";
import { batchSummary, handleInspectMany } from "../src/inspect-many";
import type { AccountFetcher } from "../src/mcp-tool";
import {
  REAL_MINT_FIXTURES,
  type RealMintFixture,
  fixtureAccountInfo,
  fixtureAddress,
} from "./real-mint-fixtures";

// A fetcher backed by the captured mainnet fixtures, so a batch can be triaged
// fully offline against real on-chain data.
function realFixtureFetcher(): AccountFetcher {
  const accountByAddress = new Map(REAL_MINT_FIXTURES.map((fixture) => [fixture.address, fixtureAccountInfo(fixture)]));
  return async (addressInput) => {
    const account = accountByAddress.get(addressInput) ?? null;
    return { status: "ok", address: new PublicKey(addressInput), account };
  };
}

function fixtureByName(name: string): RealMintFixture {
  const found = REAL_MINT_FIXTURES.find((fixture) => fixture.name === name);
  if (found === undefined) {
    throw new Error(`fixture not found: ${name}`);
  }
  return found;
}

function inspectFixture(name: string) {
  const fixture = fixtureByName(name);
  return inspectAccount(fixtureAddress(fixture), fixtureAccountInfo(fixture));
}

describe("inspectAccount over captured mainnet mints (offline, deterministic)", () => {
  it("decodes every PYUSD extension, including the confidential transfer fee that the JS enum does not name", () => {
    const result = inspectFixture("PYUSD");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    if (result.inspection.kind !== "mint") {
      return;
    }
    const { mint, assessment } = result.inspection;
    expect(mint.programKind).toBe("token-2022");
    expect(mint.decimals).toBe(6);

    const extensionIds = mint.extensions.map((extension) => extension.id);
    expect(extensionIds).toEqual([
      "mint-close-authority",
      "permanent-delegate",
      "transfer-fee",
      "confidential-transfer",
      "confidential-transfer-fee",
      "transfer-hook",
      "metadata-pointer",
      "token-metadata",
    ]);
    // The headline: code 16 is now named, so nothing falls through to "unrecognized".
    expect(extensionIds).not.toContain("unrecognized");

    const tokenMetadata = mint.extensions.find((extension) => extension.id === "token-metadata");
    expect(tokenMetadata?.detail.symbol).toBe("PYUSD");

    // PYUSD's permanent delegate is live, so the verdict is critical and the score saturates.
    expect(assessment.posture.overallSeverity).toBe("critical");
    expect(assessment.posture.score).toBe(100);
    // The permanent delegate is the hard CEX blocker. Confidential transfer is
    // friction (CEX balance opacity), not a hard blocker, and the hook has no
    // program set, so neither is in cexBlockers.
    expect(assessment.posture.cexBlockers).toContain("permanent-delegate");
    expect(assessment.posture.cexBlockers).not.toContain("confidential-transfer");
    expect(assessment.posture.cexBlockers).not.toContain("transfer-hook");
  });

  it("treats PYUSD's confidential-transfer-with-hook as a low caveat, not a false incompatibility", () => {
    const result = inspectFixture("PYUSD");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    if (result.inspection.kind !== "mint") {
      return;
    }
    const { conflicts } = result.inspection.assessment;
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].severity).toBe("low");
    expect(conflicts[0].title.toLowerCase()).toContain("no real amount");

    // PYUSD has the hook extension but no hook program is set.
    const transferHook = result.inspection.mint.extensions.find((extension) => extension.id === "transfer-hook");
    expect(transferHook?.detail.programId).toBe("none");
  });

  it("identifies USDC as a classic SPL Token mint with no extensions", () => {
    const result = inspectFixture("USDC");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    if (result.inspection.kind !== "mint") {
      return;
    }
    expect(result.inspection.mint.programKind).toBe("spl-token");
    expect(result.inspection.mint.extensions).toHaveLength(0);
    expect(result.inspection.assessment.findings).toHaveLength(0);
  });

  it("reads the live transfer fee basis points on BERN", () => {
    const result = inspectFixture("BERN");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    if (result.inspection.kind !== "mint") {
      return;
    }
    expect(result.inspection.mint.decimals).toBe(5);
    const transferFee = result.inspection.mint.extensions.find((extension) => extension.id === "transfer-fee");
    expect(transferFee?.detail.basisPoints).toBe("269");
  });

  it("reads the interest-bearing rate on sUSD", () => {
    const result = inspectFixture("sUSD");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    if (result.inspection.kind !== "mint") {
      return;
    }
    const interestBearing = result.inspection.mint.extensions.find((extension) => extension.id === "interest-bearing");
    expect(interestBearing?.detail.currentRateBps).toBe("2623");
    const tokenMetadata = result.inspection.mint.extensions.find((extension) => extension.id === "token-metadata");
    expect(tokenMetadata?.detail.symbol).toBe("sUSD");
  });

  it("reads an active transfer hook program on BNDRG", () => {
    const result = inspectFixture("BNDRG");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    if (result.inspection.kind !== "mint") {
      return;
    }
    const transferHook = result.inspection.mint.extensions.find((extension) => extension.id === "transfer-hook");
    // WNS (Wen New Standard) hook program, set and active (contrast with PYUSD's null hook).
    expect(transferHook?.detail.programId).toBe("wns1gDLt8fgLcGhWi5MqAqgXpwEP1JftKE9eZnXS1HM");
    expect(result.inspection.assessment.posture.cexBlockers).toContain("transfer-hook");
  });

  it("projects a remediation path on PYUSD that clears the critical but leaves a medium floor", () => {
    const result = inspectFixture("PYUSD");
    expect(result.status).toBe("ok");
    if (result.status !== "ok") {
      return;
    }
    if (result.inspection.kind !== "mint") {
      return;
    }
    const { remediation } = result.inspection;
    expect(remediation.currentSeverity).toBe("critical");

    const delegateStep = remediation.steps.find((step) => step.target === "permanent-delegate");
    expect(delegateStep).toBeDefined();
    // Renouncing the live permanent delegate clears the critical fund-loss risk and
    // removes the only hard CEX blocker. The confidential-transfer extension (no
    // renounce path) and the latent transfer hook remain as medium integration
    // constraints, so the path floors at medium, not info: renouncing authorities
    // makes PYUSD listable but not free of integration caveats.
    expect(delegateStep?.afterSeverity).toBe("medium");
    expect(remediation.allRenounced?.afterSeverity).toBe("medium");
  });

  it("triages all five captured mainnet mints in one batch, worst first", async () => {
    const output = await handleInspectMany(
      { mintAddresses: REAL_MINT_FIXTURES.map((fixture) => fixture.address) },
      realFixtureFetcher(),
      "https://default.example/rpc",
    );
    expect(output.status).toBe("ok");
    if (output.status !== "ok") {
      return;
    }
    const { aggregate, verdicts } = output.report;
    expect(aggregate.total).toBe(5);
    expect(aggregate.inspected).toBe(5);
    expect(aggregate.failed).toBe(0);
    // PYUSD is the worst (live permanent delegate, critical).
    expect(aggregate.worstSeverity).toBe("critical");
    expect(verdicts[0].address).toBe("2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo");
    // PYUSD and BNDRG (active hook) carry CEX blockers; USDC, BERN, sUSD do not.
    expect(aggregate.withCexBlockers).toBe(2);
  });
});

describe("resolveActiveFee (two-epoch activation rule)", () => {
  it("uses the newer fee once the current epoch has reached it", () => {
    expect(resolveActiveFee(100, 10, 300, 12, 15)).toEqual({
      activeBasisPoints: 300,
      scheduledBasisPoints: null,
      scheduledEpoch: null,
    });
  });

  it("keeps the older fee active and flags the pending newer one before activation", () => {
    expect(resolveActiveFee(100, 10, 9000, 20, 15)).toEqual({
      activeBasisPoints: 100,
      scheduledBasisPoints: 9000,
      scheduledEpoch: 20,
    });
  });

  it("falls back to the newer fee when the current epoch is unknown (offline decode)", () => {
    expect(resolveActiveFee(100, 10, 300, 12)).toEqual({
      activeBasisPoints: 300,
      scheduledBasisPoints: null,
      scheduledEpoch: null,
    });
  });
});

describe("isLiveAuthorityKey (None vs Some(zero) vs Some(key))", () => {
  it("treats null (COption None) as not live", () => {
    expect(isLiveAuthorityKey(null)).toBe(false);
  });

  it("treats the System Program / all-zero key as not live (no signer)", () => {
    expect(isLiveAuthorityKey("11111111111111111111111111111111")).toBe(false);
  });

  it("treats a real base58 key as live", () => {
    expect(isLiveAuthorityKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin")).toBe(true);
  });
});

describe("structured summaries (agent-consumable verdicts)", () => {
  it("projects an inspection to a compact verdict", () => {
    const result = inspectFixture("PYUSD");
    if (result.status !== "ok") {
      throw new Error("expected ok");
    }
    const summary = inspectionSummary(result.inspection);
    expect(summary).toMatchObject({
      kind: "mint",
      address: "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo",
      severity: "critical",
      score: 100,
    });
    expect(summary.cexBlockers).toContain("permanent-delegate");
  });

  it("projects a batch report to a compact summary with a flat verdict list", async () => {
    const output = await handleInspectMany(
      { mintAddresses: REAL_MINT_FIXTURES.map((fixture) => fixture.address) },
      realFixtureFetcher(),
      "https://default.example/rpc",
    );
    if (output.status !== "ok") {
      throw new Error("expected ok");
    }
    const summary = batchSummary(output.report);
    expect(summary.total).toBe(5);
    expect(summary.withCexBlockers).toBe(2);
    expect(summary.verdicts).toHaveLength(5);
    expect(summary.verdicts[0]).toMatchObject({ status: "ok", severity: "critical" });
    // The compact verdicts carry no nested inspection object.
    expect(summary.verdicts[0]).not.toHaveProperty("inspection");
  });
});
