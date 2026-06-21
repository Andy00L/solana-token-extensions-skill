/**
 * Static catalog mapping each Token-2022 ExtensionType to a stable string id and
 * a human label. Keyed off the ExtensionType enum from @solana/spl-token so the
 * numeric codes are never hardcoded from memory.
 * Source: @solana/spl-token extensions/extensionType.d.ts (ExtensionType enum).
 */
import { ExtensionType } from "@solana/spl-token";

export type ExtensionSurface = "mint" | "account";

export type ExtensionCatalogEntry = {
  code: ExtensionType;
  id: string;
  label: string;
  surface: ExtensionSurface;
};

const CATALOG_ENTRIES: ExtensionCatalogEntry[] = [
  { code: ExtensionType.TransferFeeConfig, id: "transfer-fee", label: "Transfer Fee", surface: "mint" },
  { code: ExtensionType.MintCloseAuthority, id: "mint-close-authority", label: "Mint Close Authority", surface: "mint" },
  { code: ExtensionType.ConfidentialTransferMint, id: "confidential-transfer", label: "Confidential Transfer", surface: "mint" },
  { code: ExtensionType.DefaultAccountState, id: "default-account-state", label: "Default Account State", surface: "mint" },
  { code: ExtensionType.NonTransferable, id: "non-transferable", label: "Non-Transferable", surface: "mint" },
  { code: ExtensionType.InterestBearingConfig, id: "interest-bearing", label: "Interest-Bearing", surface: "mint" },
  { code: ExtensionType.PermanentDelegate, id: "permanent-delegate", label: "Permanent Delegate", surface: "mint" },
  { code: ExtensionType.TransferHook, id: "transfer-hook", label: "Transfer Hook", surface: "mint" },
  { code: ExtensionType.MetadataPointer, id: "metadata-pointer", label: "Metadata Pointer", surface: "mint" },
  { code: ExtensionType.TokenMetadata, id: "token-metadata", label: "Token Metadata", surface: "mint" },
  { code: ExtensionType.GroupPointer, id: "group-pointer", label: "Group Pointer", surface: "mint" },
  { code: ExtensionType.TokenGroup, id: "token-group", label: "Token Group", surface: "mint" },
  { code: ExtensionType.GroupMemberPointer, id: "group-member-pointer", label: "Group Member Pointer", surface: "mint" },
  { code: ExtensionType.TokenGroupMember, id: "token-group-member", label: "Token Group Member", surface: "mint" },
  { code: ExtensionType.ScaledUiAmountConfig, id: "scaled-ui-amount", label: "Scaled UI Amount", surface: "mint" },
  { code: ExtensionType.PausableConfig, id: "pausable", label: "Pausable", surface: "mint" },
  // Account-level extensions. A mint never carries these, but they are included so
  // the catalog stays complete if reused to label a token-account TLV.
  { code: ExtensionType.ImmutableOwner, id: "immutable-owner", label: "Immutable Owner", surface: "account" },
  { code: ExtensionType.MemoTransfer, id: "required-memo-on-transfer", label: "Required Memo on Transfer", surface: "account" },
  { code: ExtensionType.CpiGuard, id: "cpi-guard", label: "CPI Guard", surface: "account" },
];

const CATALOG_BY_CODE: Map<number, ExtensionCatalogEntry> = new Map(
  CATALOG_ENTRIES.map((entry) => [entry.code, entry]),
);

/** Look up a catalog entry by its numeric ExtensionType code, or null if unknown. */
export function lookupExtension(code: number): ExtensionCatalogEntry | null {
  return CATALOG_BY_CODE.get(code) ?? null;
}

/** The full catalog, read-only, for callers that enumerate supported extensions. */
export function catalogEntries(): readonly ExtensionCatalogEntry[] {
  return CATALOG_ENTRIES;
}
