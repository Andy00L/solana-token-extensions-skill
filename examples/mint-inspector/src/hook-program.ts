/**
 * Second-hop hook analysis. A mint decode reveals only that a transfer hook is set
 * and which program it points at; it is blind to the single largest latent risk in
 * the extension system: whether that hook's bytecode is immutable or can be swapped
 * by an upgrade authority (for example for a sell-blocker) after an audit. This
 * module follows the hook pointer and decodes that one fact.
 *
 * It stays offline and deterministic, the same contract as the mint fetch: a couple
 * of unconditional getAccountInfo reads at addresses that are stored (not guessed),
 * no keys, no simulation, no indexer. The byte decoders here are pure; the extra
 * reads are injected by the caller.
 *
 * Layout sources (verified against the loader interface, not guessed):
 * - UpgradeableLoaderState is a u32-tagged enum. A Program record is tag 2 followed
 *   by the 32-byte programdata address, so the address is data[4..36]. A ProgramData
 *   record is tag 3, an 8-byte slot, then Option<Pubkey>: the option tag is byte 12
 *   (0 = None/immutable, 1 = Some) and the authority key is data[13..45].
 *   Source: solana-loader-v3-interface UpgradeableLoaderState, docs.rs and the SDK
 *   bpf_loader_upgradeable state.
 */
import { type AccountInfo, PublicKey } from "@solana/web3.js";
import type { Finding } from "./assess-risk";

// The BPF upgradeable loader owns programs whose bytecode can be replaced.
// Source: solana bpf_loader_upgradeable program id.
export const BPF_UPGRADEABLE_LOADER_ID = "BPFLoaderUpgradeab1e11111111111111111111111";

// The original, non-upgradeable BPF loaders. A program they own cannot change.
// Source: solana bpf_loader / bpf_loader_deprecated program ids.
const FIXED_LOADER_IDS: ReadonlySet<string> = new Set([
  "BPFLoader2111111111111111111111111111111111",
  "BPFLoader1111111111111111111111111111111111",
]);

// UpgradeableLoaderState enum tags (u32 little-endian prefix).
// Source: solana-loader-v3-interface UpgradeableLoaderState.
const PROGRAM_STATE_TAG = 2; // Program { programdata_address }
const PROGRAM_DATA_STATE_TAG = 3; // ProgramData { slot, upgrade_authority }

// Byte offsets inside a ProgramData record (after the u32 tag and u64 slot).
const PROGRAM_DATA_OPTION_TAG_OFFSET = 12; // 0 = None (immutable), 1 = Some(authority)
const PROGRAM_DATA_AUTHORITY_START = 13;
const PROGRAM_DATA_AUTHORITY_END = 45;

/** The programdata address stored in an upgradeable Program account, or null. */
export function decodeProgramDataAddress(programAccount: AccountInfo<Buffer>): string | null {
  if (programAccount.owner.toBase58() !== BPF_UPGRADEABLE_LOADER_ID) {
    return null;
  }
  const data = programAccount.data;
  if (data.length < 36 || data.readUInt32LE(0) !== PROGRAM_STATE_TAG) {
    return null;
  }
  return new PublicKey(data.subarray(4, 36)).toBase58();
}

/**
 * The upgrade authority of a ProgramData account: a base58 key when the program is
 * upgradeable, null when it is immutable (Option::None). Returns null (not a value)
 * when the account is not a decodable ProgramData record.
 */
export function decodeUpgradeAuthority(programDataAccount: AccountInfo<Buffer>): { upgradeAuthority: string | null } | null {
  const data = programDataAccount.data;
  if (data.length < PROGRAM_DATA_AUTHORITY_END || data.readUInt32LE(0) !== PROGRAM_DATA_STATE_TAG) {
    return null;
  }
  const optionTag = data[PROGRAM_DATA_OPTION_TAG_OFFSET];
  if (optionTag === 0) {
    return { upgradeAuthority: null };
  }
  if (optionTag === 1) {
    return {
      upgradeAuthority: new PublicKey(data.subarray(PROGRAM_DATA_AUTHORITY_START, PROGRAM_DATA_AUTHORITY_END)).toBase58(),
    };
  }
  return null;
}

// The mutability of a hook program's bytecode. "upgradeable" carries the authority
// that can swap it; "immutable" means the bytecode is frozen; "fixed-loader" means a
// non-upgradeable loader owns it (also frozen); "undecodable" keeps the failure as a
// value so the caller degrades to a caveat instead of throwing.
export type HookProgramVerdict =
  | { kind: "immutable" }
  | { kind: "fixed-loader" }
  | { kind: "upgradeable"; upgradeAuthority: string }
  | { kind: "undecodable"; reason: string };

/**
 * Decide a hook program's mutability from its program account and (for the
 * upgradeable loader) its ProgramData account. Pure: both accounts are already
 * fetched by the caller. programDataAccount is null when the caller could not fetch
 * it, which is reported as undecodable rather than assumed safe.
 */
export function assessHookProgram(
  programAccount: AccountInfo<Buffer>,
  programDataAccount: AccountInfo<Buffer> | null,
): HookProgramVerdict {
  const owner = programAccount.owner.toBase58();
  if (FIXED_LOADER_IDS.has(owner)) {
    return { kind: "fixed-loader" };
  }
  if (owner !== BPF_UPGRADEABLE_LOADER_ID) {
    return { kind: "undecodable", reason: `hook program has an unexpected owner (${owner})` };
  }
  const programDataAddress = decodeProgramDataAddress(programAccount);
  if (programDataAddress === null) {
    return { kind: "undecodable", reason: "hook program account is not an upgradeable Program record" };
  }
  if (programDataAccount === null) {
    return { kind: "undecodable", reason: "could not read the hook program's ProgramData account" };
  }
  const decoded = decodeUpgradeAuthority(programDataAccount);
  if (decoded === null) {
    return { kind: "undecodable", reason: "hook program's ProgramData account did not decode" };
  }
  if (decoded.upgradeAuthority === null) {
    return { kind: "immutable" };
  }
  return { kind: "upgradeable", upgradeAuthority: decoded.upgradeAuthority };
}

/**
 * Turn a hook-program verdict into an integration finding. An upgradeable hook is
 * high: any audit of its current bytecode is void the moment the upgrade authority
 * swaps it, so the verdict reports the authority rather than declaring it safe or
 * unsafe. An immutable (or fixed-loader) hook is the positive case. An undecodable
 * read degrades to a low caveat, never a silent pass.
 */
export function buildHookProgramFinding(verdict: HookProgramVerdict): Finding {
  const sourceRef = "skill/transfer-hook-security.md";
  switch (verdict.kind) {
    case "upgradeable":
      return {
        extension: "transfer-hook-program",
        severity: "high",
        surfaces: ["wallet", "dex", "cex"],
        title: "Transfer hook program is upgradeable",
        detail: `The active hook program can be replaced by its upgrade authority (${verdict.upgradeAuthority}). Any review of the hook's current behavior is void once the bytecode is swapped, so an upgradeable hook can turn into a sell-blocker after launch. This is config-invisible: a mint decode alone cannot see it.`,
        remediation:
          "Confirm the hook program's upgrade authority is renounced (immutable), a burn address, or a trusted multisig before relying on a hook audit; otherwise treat the hook bytecode as swappable at any time.",
        sourceRef,
      };
    case "immutable":
      return {
        extension: "transfer-hook-program",
        severity: "info",
        surfaces: [],
        title: "Transfer hook program is immutable",
        detail: "The active hook program has no upgrade authority, so its bytecode cannot be replaced. An audit of the current program stays valid.",
        remediation: "No action needed; the hook bytecode is frozen. Still audit the hook's logic once, since immutable does not mean benign.",
        sourceRef,
      };
    case "fixed-loader":
      return {
        extension: "transfer-hook-program",
        severity: "info",
        surfaces: [],
        title: "Transfer hook program is on a non-upgradeable loader",
        detail: "The active hook program is owned by a non-upgradeable BPF loader, so its bytecode cannot be replaced.",
        remediation: "No action needed; the hook bytecode is frozen. Still audit the hook's logic once.",
        sourceRef,
      };
    case "undecodable":
      return {
        extension: "transfer-hook-program",
        severity: "low",
        surfaces: ["wallet", "dex", "cex"],
        title: "Transfer hook program mutability could not be determined",
        detail: `The hook program's upgrade authority could not be read (${verdict.reason}), so its bytecode may be swappable. Treat the hook as potentially upgradeable until confirmed.`,
        remediation: "Re-read the hook program and its ProgramData account, and confirm the upgrade authority manually before relying on a hook audit.",
        sourceRef,
      };
  }
}
