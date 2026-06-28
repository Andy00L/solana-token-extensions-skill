/**
 * Transfer-hook integration codegen. Given a mint that carries an active transfer
 * hook, emit a correct client snippet to transfer it, with the extra accounts
 * resolved against the Execute account list (the resolution pitfall that breaks most
 * hand-written integrations), plus a static classification of the hook's
 * extra-account model and the documented footguns. Pure and offline.
 *
 * It builds on @solana/spl-token's maintained resolver
 * (createTransferCheckedWithTransferHookInstruction), which fetches the mint, finds
 * the hook, loads its ExtraAccountMetaList, and resolves the extras against the five
 * Execute accounts (source, mint, destination, owner, validation), not the four
 * TransferChecked accounts. Resolving against the wrong set is the root cause of the
 * most common transfer-hook integration failure.
 * Source: @solana/spl-token extensions/transferHook (createTransferCheckedWithTransferHookInstruction,
 * getExtraAccountMetaAddress, resolveExtraAccountMeta), solana-labs/solana-program-library#6064, #5108, #7004.
 */

export type HookCodegenInput = {
  mint: string;
  hookProgramId: string;
  decimals?: number;
};

// The Execute instruction account order the hook program sees, and the set the
// extra-account-meta seeds index into. Source: spl-transfer-hook-interface Execute.
export const EXECUTE_ACCOUNT_ORDER: readonly string[] = [
  "source (0)",
  "mint (1)",
  "destination (2)",
  "owner/authority (3)",
  "validation: extra-account-metas PDA (4)",
  "...resolved extra accounts (5+)",
];

// The default decimals when the caller does not specify (matches the SPL default).
const DEFAULT_DECIMALS = 9;

// Classification of one ExtraAccountMeta by its leading discriminator byte. Source:
// spl-tlv-account-resolution ExtraAccountMeta.discriminator (0 = literal address,
// 1 = PDA on the hook program, 2 = pubkey read from another account's data,
// >= 0x80 = PDA on a program named by another account).
export type ExtraMetaClass = {
  discriminator: number;
  kind: "literal-pubkey" | "pda-on-hook" | "pubkey-from-account-data" | "external-pda" | "unknown";
  staticallyResolvable: boolean;
  note: string;
};

/** Classify an ExtraAccountMeta discriminator byte into its resolution model. */
export function classifyExtraMeta(discriminator: number): ExtraMetaClass {
  if (discriminator === 0) {
    return {
      discriminator,
      kind: "literal-pubkey",
      staticallyResolvable: true,
      note: "A fixed address embedded in the validation account; resolvable offline.",
    };
  }
  if (discriminator === 1) {
    return {
      discriminator,
      kind: "pda-on-hook",
      staticallyResolvable: true,
      note: "A PDA on the hook program. Resolvable offline when its seeds are literals, instruction data, or account-key references; a seed that reads another account's data is runtime-only.",
    };
  }
  if (discriminator === 2) {
    return {
      discriminator,
      kind: "pubkey-from-account-data",
      staticallyResolvable: false,
      note: "An address read from another account's live data; resolvable only at runtime against current chain state.",
    };
  }
  if (discriminator >= 0x80) {
    return {
      discriminator,
      kind: "external-pda",
      staticallyResolvable: false,
      note: "A PDA on a program named by another account; resolvable only at runtime.",
    };
  }
  return {
    discriminator,
    kind: "unknown",
    staticallyResolvable: false,
    note: "Unrecognized discriminator; resolve at runtime with resolveExtraAccountMeta and verify against the hook program's source.",
  };
}

export type HookCodegenResult = {
  mint: string;
  hookProgramId: string;
  decimals: number;
  validationPda: string;
  executeAccountOrder: readonly string[];
  caveats: string[];
  code: string;
};

// The footguns a hand-written hook integration hits, each grounded in a real issue.
const HOOK_CAVEATS: string[] = [
  "Resolve the extra accounts against the Execute account list (source, mint, destination, owner, validation), not the four-account TransferChecked list. Index-based (account-key) seeds resolve to the wrong account otherwise. Source: solana-labs/solana-program-library#6064.",
  "The helper resolves the standard transfer-hook-interface Execute discriminator. A hook built with Anchor may expose a different discriminator and need a manually built Execute instruction. Source: #5108 and the Anchor transfer-hook guide.",
  "Resolving many extra accounts (roughly more than six) has hit client out-of-memory in some helper versions; keep the extra-account set small and pin a current @solana/spl-token. Source: #7004.",
  "Account-data and external-PDA metas (discriminators 2 and >= 0x80) depend on live account contents, so they can only be resolved at runtime, never precomputed offline.",
];

/**
 * Generate a correct transfer-hook transfer client for a mint, plus the validation
 * PDA, the Execute account order, and the resolution caveats. The emitted code uses
 * the maintained resolver so the extra accounts are resolved against the right set.
 */
export function generateHookTransferCodegen(input: HookCodegenInput): HookCodegenResult {
  const decimals = input.decimals ?? DEFAULT_DECIMALS;
  const lines: string[] = [];
  lines.push(`// Transfer-hook transfer client for mint ${input.mint}`);
  lines.push(`// Hook program: ${input.hookProgramId}`);
  lines.push("// Generated by the mint-inspector hook codegen. Fill the REPLACE_ values.");
  lines.push("// The resolver fetches the mint, finds the hook, loads its ExtraAccountMetaList");
  lines.push('// (PDA ["extra-account-metas", mint]), and resolves the extra accounts against the');
  lines.push("// five Execute accounts (source, mint, destination, owner, validation), which is the");
  lines.push("// correct set. Resolving against the four TransferChecked accounts is the usual bug.");
  lines.push("");
  lines.push('import { Connection, PublicKey, Transaction } from "@solana/web3.js";');
  lines.push(
    'import {\n  TOKEN_2022_PROGRAM_ID,\n  createTransferCheckedWithTransferHookInstruction,\n  getAssociatedTokenAddressSync,\n} from "@solana/spl-token";',
  );
  lines.push("");
  lines.push(`const MINT = new PublicKey("${input.mint}");`);
  lines.push(`const DECIMALS = ${decimals};`);
  lines.push("");
  lines.push("// Build a transfer that includes the hook's resolved extra accounts.");
  lines.push("export async function transferHookedToken(");
  lines.push("  connection: Connection,");
  lines.push("  sourceOwner: PublicKey,");
  lines.push("  destinationOwner: PublicKey,");
  lines.push("  amount: bigint,");
  lines.push("): Promise<Transaction> {");
  lines.push("  const source = getAssociatedTokenAddressSync(MINT, sourceOwner, false, TOKEN_2022_PROGRAM_ID);");
  lines.push("  const destination = getAssociatedTokenAddressSync(MINT, destinationOwner, false, TOKEN_2022_PROGRAM_ID);");
  lines.push("  const instruction = await createTransferCheckedWithTransferHookInstruction(");
  lines.push("    connection,");
  lines.push("    source,");
  lines.push("    MINT,");
  lines.push("    destination,");
  lines.push("    sourceOwner,");
  lines.push("    amount,");
  lines.push("    DECIMALS,");
  lines.push("    [],");
  lines.push('    "confirmed",');
  lines.push("    TOKEN_2022_PROGRAM_ID,");
  lines.push("  );");
  lines.push("  return new Transaction().add(instruction);");
  lines.push("}");
  lines.push("");
  lines.push("// If the hook is a non-standard (for example Anchor) program whose Execute");
  lines.push("// discriminator differs, resolve manually instead:");
  lines.push("//   import { getExtraAccountMetaAddress, getExtraAccountMetas, resolveExtraAccountMeta } from \"@solana/spl-token\";");
  lines.push('//   const validation = getExtraAccountMetaAddress(MINT, HOOK_PROGRAM_ID);');
  lines.push("//   const metas = getExtraAccountMetas(await connection.getAccountInfo(validation));");
  lines.push("//   then resolveExtraAccountMeta(...) for each, in Execute account order.");

  return {
    mint: input.mint,
    hookProgramId: input.hookProgramId,
    decimals,
    validationPda: `PDA ["extra-account-metas", ${input.mint}] on ${input.hookProgramId}`,
    executeAccountOrder: EXECUTE_ACCOUNT_ORDER,
    caveats: HOOK_CAVEATS,
    code: lines.join("\n"),
  };
}

// A compact, agent-consumable projection of a hook codegen result (everything but
// the code string), emitted as MCP structuredContent.
export type HookCodegenSummary = {
  mint: string;
  hookProgramId: string;
  decimals: number;
  validationPda: string;
  executeAccountOrder: string[];
  caveats: string[];
};

/** Project a hook codegen result to its compact summary (omits the code body). */
export function hookCodegenSummary(result: HookCodegenResult): HookCodegenSummary {
  return {
    mint: result.mint,
    hookProgramId: result.hookProgramId,
    decimals: result.decimals,
    validationPda: result.validationPda,
    executeAccountOrder: [...result.executeAccountOrder],
    caveats: result.caveats,
  };
}

/** Render a hook codegen result as an aligned plain-text report. */
export function formatHookCodegen(result: HookCodegenResult): string {
  const lines: string[] = [];
  lines.push("Transfer-hook integration codegen");
  lines.push(`  Mint:           ${result.mint}`);
  lines.push(`  Hook program:   ${result.hookProgramId}`);
  lines.push(`  Validation PDA: ${result.validationPda}`);
  lines.push("");
  lines.push("Execute account order (extra-account seeds index into this set):");
  for (const account of result.executeAccountOrder) {
    lines.push(`  - ${account}`);
  }
  lines.push("");
  lines.push("Resolution caveats:");
  for (const caveat of result.caveats) {
    lines.push(`  - ${caveat}`);
  }
  lines.push("");
  lines.push("Client:");
  lines.push(result.code);
  return lines.join("\n");
}
