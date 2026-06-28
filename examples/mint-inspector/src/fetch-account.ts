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

/**
 * Fetch many accounts in one getMultipleAccounts round-trip (chunked at the RPC's
 * 100-key limit), aligned to the input address order. An invalid base58 address
 * becomes an invalid-address error and is never sent to the RPC; a whole-batch RPC
 * failure makes every valid address an rpc-failed error. A missing account is
 * { account: null }, which the decoder maps to "account-not-found".
 */
export async function fetchMintAccounts(addresses: string[], rpcUrl: string): Promise<FetchResult[]> {
  const resolved = addresses.map((addressInput) => {
    try {
      return { addressInput, key: new PublicKey(addressInput) };
    } catch {
      return { addressInput, key: null };
    }
  });
  const validEntries = resolved.filter(
    (entry): entry is { addressInput: string; key: PublicKey } => entry.key !== null,
  );

  const accountByAddress = new Map<string, AccountInfo<Buffer> | null>();
  try {
    const connection = new Connection(rpcUrl, "confirmed");
    const CHUNK_SIZE = 100; // getMultipleAccounts caps at 100 keys per call. Source: Solana JSON-RPC.
    for (let start = 0; start < validEntries.length; start += CHUNK_SIZE) {
      const chunk = validEntries.slice(start, start + CHUNK_SIZE);
      const infos = await connection.getMultipleAccountsInfo(
        chunk.map((entry) => entry.key),
        "confirmed",
      );
      chunk.forEach((entry, offset) => accountByAddress.set(entry.addressInput, infos[offset] ?? null));
    }
  } catch (rpcError) {
    const detail = describeError(rpcError);
    return resolved.map((entry) =>
      entry.key === null
        ? { status: "error", reason: { kind: "invalid-address", value: entry.addressInput } }
        : { status: "error", reason: { kind: "rpc-failed", detail } },
    );
  }

  return resolved.map((entry) =>
    entry.key === null
      ? { status: "error", reason: { kind: "invalid-address", value: entry.addressInput } }
      : { status: "ok", address: entry.key, account: accountByAddress.get(entry.addressInput) ?? null },
  );
}

/**
 * Fetch a raw account (no mint/token validation) for second-hop reads such as a hook
 * program and its ProgramData. Returns null on a bad address, RPC failure, or missing
 * account, so the caller degrades to a caveat rather than throwing. An optional
 * dataSlice fetches only the bytes needed (the ProgramData header is 45 bytes), so a
 * program's full bytecode is never pulled.
 */
export async function fetchRawAccount(
  addressInput: string,
  rpcUrl: string,
  dataSlice?: { offset: number; length: number },
): Promise<AccountInfo<Buffer> | null> {
  let address: PublicKey;
  try {
    address = new PublicKey(addressInput);
  } catch {
    return null;
  }
  try {
    const connection = new Connection(rpcUrl, "confirmed");
    return await connection.getAccountInfo(address, { commitment: "confirmed", dataSlice });
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
