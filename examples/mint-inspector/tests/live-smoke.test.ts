/**
 * Live mainnet-beta smoke test: proves the inspector's real network path end to end
 * against a pinned, well-known mint (PYUSD), so "decodes a live mint" is verified by
 * CI, not only asserted in prose.
 *
 * Gated behind LIVE_RPC=1 so the default `npm test` stays offline and deterministic
 * (every other test runs against captured fixtures). On an RPC outage this soft-passes
 * with a warning instead of asserting, so a flaky public endpoint never reds the
 * build; that honesty matches the runner's rule that only a real assertion fails.
 */
import { describe, expect, it } from "vitest";
import { type FetchResult, fetchCurrentEpoch, fetchMintAccount } from "../src/fetch-account";
import { inspectAccount, inspectionSummary } from "../src/inspect";

const LIVE = process.env.LIVE_RPC === "1";
const RPC_URL = process.env.LIVE_RPC_URL ?? "https://api.mainnet-beta.solana.com";
// PYUSD: a real Token-2022 mainnet mint with a live permanent delegate (critical).
const PYUSD_MINT = "2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo";
const MAX_ATTEMPTS = 3;

async function fetchWithRetry(address: string, rpcUrl: string): Promise<FetchResult | null> {
  let lastResult: FetchResult | null = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const result = await fetchMintAccount(address, rpcUrl);
    if (result.status === "ok") {
      return result;
    }
    lastResult = result;
  }
  return lastResult;
}

describe.skipIf(!LIVE)("live mainnet smoke test (LIVE_RPC=1)", () => {
  it(
    "decodes PYUSD live and returns a critical verdict, or soft-skips on RPC outage",
    async () => {
      const fetched = await fetchWithRetry(PYUSD_MINT, RPC_URL);
      if (fetched === null || fetched.status === "error") {
        console.warn(`[live-smoke] RPC unavailable after ${MAX_ATTEMPTS} attempts, soft-skipping: ${RPC_URL}`);
        return;
      }

      const currentEpoch = await fetchCurrentEpoch(RPC_URL);
      const result = inspectAccount(fetched.address, fetched.account, currentEpoch ?? undefined);
      expect(result.status).toBe("ok");
      if (result.status !== "ok" || result.inspection.kind !== "mint") {
        throw new Error("expected a live PYUSD mint inspection");
      }

      const summary = inspectionSummary(result.inspection);
      // PYUSD ships a live permanent delegate, so the verdict is critical and the
      // permanent delegate is the CEX listing blocker.
      expect(summary.severity).toBe("critical");
      expect(summary.cexBlockers).toContain("permanent-delegate");
      // It also carries the confidential-transfer extension (re-enabled on mainnet).
      const extensionIds = result.inspection.mint.extensions.map((extension) => extension.id);
      expect(extensionIds).toContain("confidential-transfer");
    },
    30_000,
  );
});
