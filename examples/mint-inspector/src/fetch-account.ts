/**
 * The only IO in the inspector: resolve an address and fetch its account from an
 * RPC. Errors are returned as values (invalid address, RPC failure). A missing
 * account is reported as { account: null }, which the decoder maps to a typed
 * "account-not-found" error.
 */
import { type AccountInfo, Connection, PublicKey } from "@solana/web3.js";
import { describeError } from "./describe-error";

export type FetchError =
  | { kind: "invalid-address"; value: string }
  | { kind: "rpc-failed"; detail: string };

export type FetchResult =
  | { status: "ok"; address: PublicKey; account: AccountInfo<Buffer> | null }
  | { status: "error"; reason: FetchError };

/** Fetch a single account from the given RPC endpoint. */
export async function fetchMintAccount(addressInput: string, rpcUrl: string): Promise<FetchResult> {
  let address: PublicKey;
  try {
    address = new PublicKey(addressInput);
  } catch {
    return { status: "error", reason: { kind: "invalid-address", value: addressInput } };
  }

  try {
    const connection = new Connection(rpcUrl, "confirmed");
    const account = await connection.getAccountInfo(address, "confirmed");
    return { status: "ok", address, account };
  } catch (rpcError) {
    return { status: "error", reason: { kind: "rpc-failed", detail: describeError(rpcError) } };
  }
}

/**
 * Fetch the current epoch number, or null if the RPC call fails. Callers then decode
 * without epoch-aware active-fee resolution (the newer fee is used as the fallback).
 */
export async function fetchCurrentEpoch(rpcUrl: string): Promise<number | null> {
  try {
    const connection = new Connection(rpcUrl, "confirmed");
    const epochInfo = await connection.getEpochInfo("confirmed");
    return epochInfo.epoch;
  } catch {
    return null;
  }
}

/** A human-readable fetch error message. */
export function formatFetchError(reason: FetchError): string {
  switch (reason.kind) {
    case "invalid-address":
      return `invalid mint address: ${reason.value}`;
    case "rpc-failed":
      return `RPC request failed: ${reason.detail}`;
  }
}
