import { describe, expect, it } from "vitest";
import { type RawAccountFetcher, enrichInspectionWithHookProgram, inspectAccount } from "../src/inspect";
import { WNS_HOOK_PROGRAM, fixtureAccountInfo, fixtureAddress, fixtureByName, loaderAccountInfo } from "../src/mainnet-fixtures";

function inspectFixture(name: string) {
  const fixture = fixtureByName(name);
  if (fixture === null) {
    throw new Error(`fixture not found: ${name}`);
  }
  return inspectAccount(fixtureAddress(fixture), fixtureAccountInfo(fixture));
}

// A fetcher backed by the captured WNS program + ProgramData header blobs, so the
// second hop runs fully offline against real on-chain data.
const wnsFetcher: RawAccountFetcher = async (address) => {
  if (address === WNS_HOOK_PROGRAM.programId) {
    return loaderAccountInfo(WNS_HOOK_PROGRAM.programBase64, true);
  }
  if (address === WNS_HOOK_PROGRAM.programDataAddress) {
    return loaderAccountInfo(WNS_HOOK_PROGRAM.programDataBase64, false);
  }
  return null;
};

describe("second-hop hook-program enrichment", () => {
  it("flags BNDRG's active WNS hook as upgradeable and a CEX blocker (real data)", async () => {
    const result = inspectFixture("BNDRG");
    if (result.status !== "ok" || result.inspection.kind !== "mint") {
      throw new Error("expected a mint");
    }
    const enriched = await enrichInspectionWithHookProgram(result.inspection, wnsFetcher);
    if (enriched.kind !== "mint") {
      throw new Error("expected a mint");
    }
    const finding = enriched.assessment.findings.find((entry) => entry.extension === "transfer-hook-program");
    expect(finding).toBeDefined();
    expect(finding?.severity).toBe("high");
    expect(finding?.detail).toContain(WNS_HOOK_PROGRAM.upgradeAuthority);
    expect(enriched.assessment.posture.cexBlockers).toContain("transfer-hook-program");
  });

  it("leaves a hook with no program set unchanged and does not fetch", async () => {
    // PYUSD carries the transfer-hook extension but no program is set (programId "none").
    const result = inspectFixture("PYUSD");
    if (result.status !== "ok" || result.inspection.kind !== "mint") {
      throw new Error("expected a mint");
    }
    let fetched = false;
    const noFetch: RawAccountFetcher = async () => {
      fetched = true;
      return null;
    };
    const enriched = await enrichInspectionWithHookProgram(result.inspection, noFetch);
    expect(fetched).toBe(false);
    if (enriched.kind !== "mint") {
      throw new Error("expected a mint");
    }
    expect(enriched.assessment.findings.some((entry) => entry.extension === "transfer-hook-program")).toBe(false);
  });

  it("degrades to a low caveat when the hook program cannot be read", async () => {
    const result = inspectFixture("BNDRG");
    if (result.status !== "ok" || result.inspection.kind !== "mint") {
      throw new Error("expected a mint");
    }
    const nullFetcher: RawAccountFetcher = async () => null;
    const enriched = await enrichInspectionWithHookProgram(result.inspection, nullFetcher);
    if (enriched.kind !== "mint") {
      throw new Error("expected a mint");
    }
    const finding = enriched.assessment.findings.find((entry) => entry.extension === "transfer-hook-program");
    expect(finding?.severity).toBe("low");
  });

  it("leaves a classic mint with no hook unchanged", async () => {
    const result = inspectFixture("USDC");
    if (result.status !== "ok" || result.inspection.kind !== "mint") {
      throw new Error("expected a mint");
    }
    const enriched = await enrichInspectionWithHookProgram(result.inspection, wnsFetcher);
    if (enriched.kind !== "mint") {
      throw new Error("expected a mint");
    }
    expect(enriched.assessment.findings.some((entry) => entry.extension === "transfer-hook-program")).toBe(false);
  });
});
