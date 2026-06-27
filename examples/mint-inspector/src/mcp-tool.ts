/**
 * The inspect_mint tool logic, decoupled from any transport. It takes the account
 * fetcher as a parameter, so it is testable offline with an injected fetcher and
 * reused unchanged by both the CLI and the MCP server.
 */
import type { DecodeError } from "./decode-mint";
import type { FetchError, FetchResult } from "./fetch-account";
import { type Inspection, inspectAccount } from "./inspect";

export type AccountFetcher = (addressInput: string, rpcUrl: string) => Promise<FetchResult>;

export type InspectToolInput = {
  mintAddress: string;
  rpcUrl?: string;
  // Current epoch, used to resolve the active transfer fee under the two-epoch rule.
  currentEpoch?: number;
};

export type InspectToolOutput =
  | { status: "ok"; inspection: Inspection }
  | { status: "error"; reason: FetchError | DecodeError };

/**
 * Run an inspection through an injected fetcher. Falls back to defaultRpcUrl when
 * the caller does not specify one.
 */
export async function handleInspectMint(
  input: InspectToolInput,
  fetchAccount: AccountFetcher,
  defaultRpcUrl: string,
): Promise<InspectToolOutput> {
  const rpcUrl = input.rpcUrl !== undefined && input.rpcUrl.length > 0 ? input.rpcUrl : defaultRpcUrl;

  const fetched = await fetchAccount(input.mintAddress, rpcUrl);
  if (fetched.status === "error") {
    return { status: "error", reason: fetched.reason };
  }

  const result = inspectAccount(fetched.address, fetched.account, input.currentEpoch);
  if (result.status === "error") {
    return { status: "error", reason: result.reason };
  }

  return { status: "ok", inspection: result.inspection };
}
