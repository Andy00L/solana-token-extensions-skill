/**
 * Decode a Token-2022 (or classic SPL Token) mint account into a serializable
 * structure: decimals, supply, authorities, and the list of extensions with a
 * small per-extension detail map.
 *
 * There is no throw in this module's public surface. unpackMint and the metadata
 * unpack are third-party parsers that throw on malformed input; each is wrapped at
 * its parsing boundary and converted to a typed error value.
 * Source: @solana/spl-token unpackMint, getExtensionTypes, per-extension getters.
 */
import { type AccountInfo, PublicKey } from "@solana/web3.js";
import {
  AccountState,
  ExtensionType,
  type Mint,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getDefaultAccountState,
  getExtensionData,
  getExtensionTypes,
  getInterestBearingMintConfigState,
  getMetadataPointerState,
  getMintCloseAuthority,
  getPausableConfig,
  getPermanentDelegate,
  getScaledUiAmountConfig,
  getTransferFeeConfig,
  getTransferHook,
  unpackMint,
} from "@solana/spl-token";
import { unpack } from "@solana/spl-token-metadata";
import { describeError } from "./describe-error";
import { lookupExtension } from "./extension-catalog";

export type TokenProgramKind = "token-2022" | "spl-token";

export type DecodedExtension = {
  code: number;
  id: string;
  label: string;
  detail: Record<string, string>;
};

export type DecodedMint = {
  address: string;
  programId: string;
  programKind: TokenProgramKind;
  decimals: number;
  supply: string;
  mintAuthority: string | null;
  freezeAuthority: string | null;
  isInitialized: boolean;
  extensions: DecodedExtension[];
};

export type DecodeError =
  | { kind: "account-not-found" }
  | { kind: "wrong-owner"; owner: string }
  | { kind: "not-a-mint"; detail: string };

export type DecodeResult =
  | { status: "ok"; mint: DecodedMint }
  | { status: "error"; reason: DecodeError };

/**
 * Decode an already-fetched account. Pure: the caller performs the IO and passes
 * the account in (or null when it does not exist), so this function is fully
 * deterministic and testable offline.
 */
export function decodeMint(address: PublicKey, accountInfo: AccountInfo<Buffer> | null): DecodeResult {
  if (accountInfo === null) {
    return { status: "error", reason: { kind: "account-not-found" } };
  }

  const programKind = classifyOwner(accountInfo.owner);
  if (programKind === null) {
    return { status: "error", reason: { kind: "wrong-owner", owner: accountInfo.owner.toBase58() } };
  }

  const programId = programKind === "token-2022" ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;

  // Parsing boundary: unpackMint throws on a wrong-size or non-mint account.
  let mint: Mint;
  try {
    mint = unpackMint(address, accountInfo, programId);
  } catch (parseError) {
    return { status: "error", reason: { kind: "not-a-mint", detail: describeError(parseError) } };
  }

  // Classic SPL Token mints carry no extension TLV; only Token-2022 mints do.
  const extensions = programKind === "token-2022" ? decodeExtensions(mint) : [];

  return {
    status: "ok",
    mint: {
      address: address.toBase58(),
      programId: accountInfo.owner.toBase58(),
      programKind,
      decimals: mint.decimals,
      supply: mint.supply.toString(),
      mintAuthority: mint.mintAuthority === null ? null : mint.mintAuthority.toBase58(),
      freezeAuthority: mint.freezeAuthority === null ? null : mint.freezeAuthority.toBase58(),
      isInitialized: mint.isInitialized,
      extensions,
    },
  };
}

function classifyOwner(owner: PublicKey): TokenProgramKind | null {
  if (owner.equals(TOKEN_2022_PROGRAM_ID)) {
    return "token-2022";
  }
  if (owner.equals(TOKEN_PROGRAM_ID)) {
    return "spl-token";
  }
  return null;
}

function decodeExtensions(mint: Mint): DecodedExtension[] {
  return getExtensionTypes(mint.tlvData).map((code) => describeExtension(mint, code));
}

function describeExtension(mint: Mint, code: ExtensionType): DecodedExtension {
  const entry = lookupExtension(code);
  if (entry === null) {
    return { code, id: "unrecognized", label: `Unrecognized extension (code ${code})`, detail: {} };
  }
  return { code, id: entry.id, label: entry.label, detail: enrichExtension(mint, code) };
}

function enrichExtension(mint: Mint, code: ExtensionType): Record<string, string> {
  switch (code) {
    case ExtensionType.TransferFeeConfig:
      return describeTransferFee(mint);
    case ExtensionType.TransferHook:
      return describeTransferHook(mint);
    case ExtensionType.PermanentDelegate:
      return describePermanentDelegate(mint);
    case ExtensionType.MintCloseAuthority:
      return describeMintCloseAuthority(mint);
    case ExtensionType.DefaultAccountState:
      return describeDefaultAccountState(mint);
    case ExtensionType.InterestBearingConfig:
      return describeInterestBearing(mint);
    case ExtensionType.MetadataPointer:
      return describeMetadataPointer(mint);
    case ExtensionType.ScaledUiAmountConfig:
      return describeScaledUiAmount(mint);
    case ExtensionType.PausableConfig:
      return describePausable(mint);
    case ExtensionType.TokenMetadata:
      return describeTokenMetadata(mint);
    default:
      return {};
  }
}

function describeTransferFee(mint: Mint): Record<string, string> {
  const config = getTransferFeeConfig(mint);
  if (config === null) {
    return {};
  }
  return {
    basisPoints: config.newerTransferFee.transferFeeBasisPoints.toString(),
    maximumFee: config.newerTransferFee.maximumFee.toString(),
    feeConfigAuthority: describeOptionalKey(config.transferFeeConfigAuthority),
    withdrawWithheldAuthority: describeOptionalKey(config.withdrawWithheldAuthority),
  };
}

function describeTransferHook(mint: Mint): Record<string, string> {
  const hook = getTransferHook(mint);
  if (hook === null) {
    return {};
  }
  // A default (zero) program id means the extension is present but no hook program
  // is set; describeOptionalKey renders that as "none".
  return {
    programId: describeOptionalKey(hook.programId),
    authority: describeOptionalKey(hook.authority),
  };
}

function describePermanentDelegate(mint: Mint): Record<string, string> {
  const permanentDelegate = getPermanentDelegate(mint);
  if (permanentDelegate === null) {
    return {};
  }
  return { delegate: describeOptionalKey(permanentDelegate.delegate) };
}

function describeMintCloseAuthority(mint: Mint): Record<string, string> {
  const closeAuthority = getMintCloseAuthority(mint);
  if (closeAuthority === null) {
    return {};
  }
  return { closeAuthority: describeOptionalKey(closeAuthority.closeAuthority) };
}

function describeDefaultAccountState(mint: Mint): Record<string, string> {
  const defaultState = getDefaultAccountState(mint);
  if (defaultState === null) {
    return {};
  }
  return { state: describeAccountState(defaultState.state) };
}

function describeInterestBearing(mint: Mint): Record<string, string> {
  const config = getInterestBearingMintConfigState(mint);
  if (config === null) {
    return {};
  }
  return {
    currentRateBps: config.currentRate.toString(),
    rateAuthority: describeOptionalKey(config.rateAuthority),
  };
}

function describeMetadataPointer(mint: Mint): Record<string, string> {
  const pointer = getMetadataPointerState(mint);
  if (pointer === null) {
    return {};
  }
  const detail: Record<string, string> = {};
  const { metadataAddress, authority } = pointer;
  if (metadataAddress !== undefined && metadataAddress !== null) {
    detail.metadataAddress = metadataAddress.toBase58();
  }
  if (authority !== undefined && authority !== null) {
    detail.authority = describeOptionalKey(authority);
  }
  return detail;
}

function describeScaledUiAmount(mint: Mint): Record<string, string> {
  const config = getScaledUiAmountConfig(mint);
  if (config === null) {
    return {};
  }
  return {
    multiplier: config.multiplier.toString(),
    authority: describeOptionalKey(config.authority),
  };
}

function describePausable(mint: Mint): Record<string, string> {
  const config = getPausableConfig(mint);
  if (config === null) {
    return {};
  }
  return {
    paused: String(config.paused),
    authority: describeOptionalKey(config.authority),
  };
}

function describeTokenMetadata(mint: Mint): Record<string, string> {
  const data = getExtensionData(ExtensionType.TokenMetadata, mint.tlvData);
  if (data === null) {
    return {};
  }
  // Parsing boundary: unpack throws on a malformed metadata TLV.
  try {
    const metadata = unpack(data);
    return {
      name: metadata.name,
      symbol: metadata.symbol,
      uri: metadata.uri,
      additionalFields: metadata.additionalMetadata.length.toString(),
    };
  } catch {
    return {};
  }
}

function describeAccountState(state: AccountState): string {
  switch (state) {
    case AccountState.Uninitialized:
      return "uninitialized";
    case AccountState.Initialized:
      return "initialized";
    case AccountState.Frozen:
      return "frozen";
    default:
      return `unknown(${state})`;
  }
}

/** Render an optional authority key, treating the zero key as "none". */
function describeOptionalKey(key: PublicKey | null | undefined): string {
  if (key === null || key === undefined) {
    return "none";
  }
  if (key.equals(PublicKey.default)) {
    return "none";
  }
  return key.toBase58();
}
