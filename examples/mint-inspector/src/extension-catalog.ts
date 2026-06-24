/**
 * Static catalog mapping each Token-2022 ExtensionType to a stable string id and
 * a human label. Keyed off the ExtensionType enum from @solana/spl-token so the
 * numeric codes are never hardcoded from memory.
 * Source: @solana/spl-token extensions/extensionType.d.ts (ExtensionType enum).
 */
import { ExtensionType } from "@solana/spl-token";

export type ExtensionSurface = "mint" | "account";

export type ExtensionCatalogEntry = {
  // Numeric ExtensionType code. Typed as number (not the enum) because a few codes
  // are defined by the canonical spl-token-2022 interface but not yet named by the
  // published @solana/spl-token enum; those are added in INTERFACE_ONLY_ENTRIES.
  code: number;
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
  // Account-level extensions. A mint never carries these; they are used to label a
  // token-account TLV when the inspector decodes a token account rather than a mint.
  { code: ExtensionType.ImmutableOwner, id: "immutable-owner", label: "Immutable Owner", surface: "account" },
  { code: ExtensionType.MemoTransfer, id: "required-memo-on-transfer", label: "Required Memo on Transfer", surface: "account" },
  { code: ExtensionType.CpiGuard, id: "cpi-guard", label: "CPI Guard", surface: "account" },
  { code: ExtensionType.TransferFeeAmount, id: "transfer-fee-amount", label: "Transfer Fee Amount", surface: "account" },
  { code: ExtensionType.NonTransferableAccount, id: "non-transferable-account", label: "Non-Transferable Account", surface: "account" },
  { code: ExtensionType.TransferHookAccount, id: "transfer-hook-account", label: "Transfer Hook Account", surface: "account" },
  { code: ExtensionType.PausableAccount, id: "pausable-account", label: "Pausable Account", surface: "account" },
];

// Codes the canonical spl-token-2022 interface defines but the published
// @solana/spl-token JS enum (0.4.14) does not name: it skips 16, 17, 24, and 28.
// They are listed as numeric literals taken from the interface enum and cited
// below (not guessed), so a real mint that carries one is labeled instead of
// falling through to "unrecognized". PayPal USD (PYUSD), for example, carries code 16.
// Source: spl-token-2022-interface ExtensionType (#[repr(u16)]),
// https://github.com/solana-program/token-2022/blob/main/interface/src/extension/mod.rs
const INTERFACE_ONLY_ENTRIES: ExtensionCatalogEntry[] = [
  { code: 16, id: "confidential-transfer-fee", label: "Confidential Transfer Fee", surface: "mint" },
  { code: 17, id: "confidential-transfer-fee-amount", label: "Confidential Transfer Fee Amount", surface: "account" },
  { code: 24, id: "confidential-mint-burn", label: "Confidential Mint and Burn", surface: "mint" },
  { code: 28, id: "permissioned-burn", label: "Permissioned Burn", surface: "mint" },
];

const ALL_ENTRIES: ExtensionCatalogEntry[] = [...CATALOG_ENTRIES, ...INTERFACE_ONLY_ENTRIES];

const CATALOG_BY_CODE: Map<number, ExtensionCatalogEntry> = new Map(
  ALL_ENTRIES.map((entry) => [entry.code, entry]),
);

/** Look up a catalog entry by its numeric ExtensionType code, or null if unknown. */
export function lookupExtension(code: number): ExtensionCatalogEntry | null {
  return CATALOG_BY_CODE.get(code) ?? null;
}

/** The full catalog, read-only, for callers that enumerate supported extensions. */
export function catalogEntries(): readonly ExtensionCatalogEntry[] {
  return ALL_ENTRIES;
}
