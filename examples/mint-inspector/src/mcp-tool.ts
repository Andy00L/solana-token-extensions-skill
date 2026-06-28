/**
 * The inspect_mint tool logic, decoupled from any transport. It takes the account
 * fetcher as a parameter, so it is testable offline with an injected fetcher and
 * reused unchanged by both the CLI and the MCP server.
 */
import type { AccountInfo } from "@solana/web3.js";
import type { DecodeError } from "./decode-mint";
import type { FetchError, FetchResult } from "./fetch-account";
import { type Inspection, enrichInspectionWithHookProgram, inspectAccount } from "./inspect";

export type AccountFetcher = (addressInput: string, rpcUrl: string) => Promise<FetchResult>;

// A raw second-hop reader (the hook program and its ProgramData header) for the
// upgrade-authority analysis. Optional: when omitted, the inspection is returned
// without the second hop, so offline tests can exercise the base path unchanged.
export type RawAccountReader = (
  address: string,
  rpcUrl: string,
  dataSlice?: { offset: number; length: number },
) => Promise<AccountInfo<Buffer> | null>;

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
  readRawAccount?: RawAccountReader,
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

  if (readRawAccount === undefined) {
    return { status: "ok", inspection: result.inspection };
  }
  // Second hop: follow an active transfer hook to its program and assess mutability.
  const inspection = await enrichInspectionWithHookProgram(result.inspection, (address, dataSlice) =>
    readRawAccount(address, rpcUrl, dataSlice),
  );
  return { status: "ok", inspection };
}
