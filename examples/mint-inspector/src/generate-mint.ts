/**
 * Build-time mint scaffold generator. Given a proposed extension set it first vets
 * it (reusing checkCompatibility), refuses any set the runtime would reject at
 * initialization, and otherwise emits a correct, correctly-ordered, correctly-sized
 * Token-2022 mint creation scaffold plus a structured init plan. Pure and offline.
 *
 * The two footguns this removes are init order (fixed-length extensions before
 * InitializeMint; variable-length token metadata after it, in one transaction) and
 * account sizing (getMintLen over the fixed extension set, plus the metadata length
 * when token metadata is present). Both are grounded in the proven, tested build in
 * examples/ts-multi-extension-mint/src/build-multi-extension-mint.ts and the
 * @solana/spl-token instruction signatures.
 */
import { type CompatibilityResult, checkCompatibility } from "./check-compatibility";

export type GenerateMintInput = {
  extensions: string[];
  // Base-10 decimals for the mint. Default 9 (the common SPL default).
  decimals?: number;
};

export type MintInitStep = {
  order: number;
  phase: "create-account" | "before-init-mint" | "init-mint" | "after-init-mint";
  instruction: string;
  note: string;
};

export type GenerateMintResult =
  | { status: "rejected"; reason: "unrecognized-extension" | "illegal-combination"; compatibility: CompatibilityResult }
  | {
      status: "ok";
      recognized: string[];
      // The subset of recognized ids this generator can scaffold.
      scaffoldable: string[];
      // Recognized ids with no scaffold spec (advanced or interface-only); the dev
      // must add their initialization manually. Listed, never silently dropped.
      unsupported: string[];
      decimals: number;
      steps: MintInitStep[];
      code: string;
      compatibility: CompatibilityResult;
    };

// The default decimals when the caller does not specify. Source: SPL convention.
const DEFAULT_DECIMALS = 9;

type SpecModule = "@solana/spl-token" | "@solana/spl-token-metadata";

// One scaffold spec per supported extension id. Signatures are taken verbatim from
// the installed @solana/spl-token type declarations (extensions/*/instructions.d.ts)
// and @solana/spl-token-metadata, so the emitted calls match the library, not memory.
type MintExtensionSpec = {
  // ExtensionType member name for getMintLen; null for variable-length token metadata.
  lengthType: string | null;
  // Instruction-builder function name, or null if the extension has no separate init.
  initFunction: string;
  initModule: SpecModule;
  phase: "before-init-mint" | "after-init-mint";
  // The instruction-builder call as it appears in the scaffold. Uses `mint`,
  // `authority`, `TOKEN_2022_PROGRAM_ID`, and the placeholder constants below.
  call: string;
  // Placeholder constant declarations the scaffold emits for this extension.
  placeholders: string[];
  note: string;
};

// Catalog order also fixes the order of before-init instructions in the scaffold.
const SPECS: Array<[string, MintExtensionSpec]> = [
  [
    "transfer-fee",
    {
      lengthType: "TransferFeeConfig",
      initFunction: "createInitializeTransferFeeConfigInstruction",
      initModule: "@solana/spl-token",
      phase: "before-init-mint",
      call: "createInitializeTransferFeeConfigInstruction(mint, authority, authority, FEE_BASIS_POINTS, MAX_FEE, TOKEN_2022_PROGRAM_ID)",
      placeholders: [
        "const FEE_BASIS_POINTS = 50; // 0.50%; basis points, 10000 = 100%",
        "const MAX_FEE = 5_000_000_000n; // cap per transfer, base units",
      ],
      note: "A live fee-config authority can raise the rate; renounce it to lock the fee.",
    },
  ],
  [
    "permanent-delegate",
    {
      lengthType: "PermanentDelegate",
      initFunction: "createInitializePermanentDelegateInstruction",
      initModule: "@solana/spl-token",
      phase: "before-init-mint",
      call: "createInitializePermanentDelegateInstruction(mint, PERMANENT_DELEGATE, TOKEN_2022_PROGRAM_ID)",
      placeholders: ['const PERMANENT_DELEGATE = new PublicKey("REPLACE_permanent_delegate");'],
      note: "Irrevocable: the delegate can transfer or burn any holder balance. Use only if disclosed.",
    },
  ],
  [
    "mint-close-authority",
    {
      lengthType: "MintCloseAuthority",
      initFunction: "createInitializeMintCloseAuthorityInstruction",
      initModule: "@solana/spl-token",
      phase: "before-init-mint",
      call: "createInitializeMintCloseAuthorityInstruction(mint, CLOSE_AUTHORITY, TOKEN_2022_PROGRAM_ID)",
      placeholders: ['const CLOSE_AUTHORITY = new PublicKey("REPLACE_close_authority");'],
      note: "Allows closing the mint at zero supply; renounce if the mint must be permanent.",
    },
  ],
  [
    "default-account-state",
    {
      lengthType: "DefaultAccountState",
      initFunction: "createInitializeDefaultAccountStateInstruction",
      initModule: "@solana/spl-token",
      phase: "before-init-mint",
      call: "createInitializeDefaultAccountStateInstruction(mint, DEFAULT_ACCOUNT_STATE, TOKEN_2022_PROGRAM_ID)",
      placeholders: ["const DEFAULT_ACCOUNT_STATE = AccountState.Frozen; // or AccountState.Initialized"],
      note: "Frozen-by-default needs a freeze authority to thaw each account before it can transact.",
    },
  ],
  [
    "transfer-hook",
    {
      lengthType: "TransferHook",
      initFunction: "createInitializeTransferHookInstruction",
      initModule: "@solana/spl-token",
      phase: "before-init-mint",
      call: "createInitializeTransferHookInstruction(mint, authority, HOOK_PROGRAM_ID, TOKEN_2022_PROGRAM_ID)",
      placeholders: ['const HOOK_PROGRAM_ID = new PublicKey("REPLACE_hook_program");'],
      note: "The hook runs on every transfer; audit it and resolve its ExtraAccountMetaList for clients.",
    },
  ],
  [
    "interest-bearing",
    {
      lengthType: "InterestBearingConfig",
      initFunction: "createInitializeInterestBearingMintInstruction",
      initModule: "@solana/spl-token",
      phase: "before-init-mint",
      call: "createInitializeInterestBearingMintInstruction(mint, authority, INTEREST_RATE_BPS, TOKEN_2022_PROGRAM_ID)",
      placeholders: ["const INTEREST_RATE_BPS = 500; // 5.00% per year for display; signed i16 basis points"],
      note: "Display only: the UI amount drifts from the raw amount; settle on raw base units.",
    },
  ],
  [
    "scaled-ui-amount",
    {
      lengthType: "ScaledUiAmountConfig",
      initFunction: "createInitializeScaledUiAmountConfigInstruction",
      initModule: "@solana/spl-token",
      phase: "before-init-mint",
      call: "createInitializeScaledUiAmountConfigInstruction(mint, authority, UI_MULTIPLIER, TOKEN_2022_PROGRAM_ID)",
      placeholders: ["const UI_MULTIPLIER = 1; // display multiplier applied to the raw amount"],
      note: "Display only; mutually exclusive with interest-bearing.",
    },
  ],
  [
    "pausable",
    {
      lengthType: "PausableConfig",
      initFunction: "createInitializePausableConfigInstruction",
      initModule: "@solana/spl-token",
      phase: "before-init-mint",
      call: "createInitializePausableConfigInstruction(mint, authority, TOKEN_2022_PROGRAM_ID)",
      placeholders: [],
      note: "A live pause authority can halt every transfer, mint, and burn mint-wide.",
    },
  ],
  [
    "non-transferable",
    {
      lengthType: "NonTransferable",
      initFunction: "createInitializeNonTransferableMintInstruction",
      initModule: "@solana/spl-token",
      phase: "before-init-mint",
      call: "createInitializeNonTransferableMintInstruction(mint, TOKEN_2022_PROGRAM_ID)",
      placeholders: [],
      note: "Soulbound: the token cannot be transferred, only minted and burned.",
    },
  ],
  [
    "metadata-pointer",
    {
      lengthType: "MetadataPointer",
      initFunction: "createInitializeMetadataPointerInstruction",
      initModule: "@solana/spl-token",
      phase: "before-init-mint",
      // Self-pointer: the metadata lives on the mint account itself.
      call: "createInitializeMetadataPointerInstruction(mint, authority, mint, TOKEN_2022_PROGRAM_ID)",
      placeholders: [],
      note: "Points to where metadata lives; pair with token-metadata to store it on the mint.",
    },
  ],
  [
    "group-pointer",
    {
      lengthType: "GroupPointer",
      initFunction: "createInitializeGroupPointerInstruction",
      initModule: "@solana/spl-token",
      phase: "before-init-mint",
      call: "createInitializeGroupPointerInstruction(mint, authority, mint, TOKEN_2022_PROGRAM_ID)",
      placeholders: [],
      note: "Points to a token-group account; group tooling support varies.",
    },
  ],
  [
    "group-member-pointer",
    {
      lengthType: "GroupMemberPointer",
      initFunction: "createInitializeGroupMemberPointerInstruction",
      initModule: "@solana/spl-token",
      phase: "before-init-mint",
      call: "createInitializeGroupMemberPointerInstruction(mint, authority, mint, TOKEN_2022_PROGRAM_ID)",
      placeholders: [],
      note: "Points to a group-member account; group tooling support varies.",
    },
  ],
  [
    "token-metadata",
    {
      lengthType: null, // variable length: not in getMintLen, sized via the metadata length
      initFunction: "createInitializeMetadataInstruction",
      initModule: "@solana/spl-token-metadata",
      phase: "after-init-mint",
      call: "createInitializeMetadataInstruction({ programId: TOKEN_2022_PROGRAM_ID, metadata: mint, updateAuthority: authority, mint, mintAuthority: authority, name: TOKEN_NAME, symbol: TOKEN_SYMBOL, uri: TOKEN_URI })",
      placeholders: [
        'const TOKEN_NAME = "REPLACE Name";',
        'const TOKEN_SYMBOL = "REPLACE";',
        'const TOKEN_URI = "https://example.com/metadata.json";',
      ],
      note: "Initialized after InitializeMint; usually paired with metadata-pointer (self).",
    },
  ],
];

const SPEC_BY_ID: Map<string, MintExtensionSpec> = new Map(SPECS.map(([id, spec]) => [id, spec]));

/**
 * Vet a proposed extension set and, if it is legal, generate a Token-2022 mint
 * creation scaffold and a structured init plan. Refuses any set with an unrecognized
 * id or a runtime-rejected combination, so it never emits code for a mint that would
 * fail at initialization.
 */
export function generateMintScaffold(input: GenerateMintInput): GenerateMintResult {
  const compatibility = checkCompatibility({ extensions: input.extensions });

  if (compatibility.unrecognized.length > 0) {
    return { status: "rejected", reason: "unrecognized-extension", compatibility };
  }
  if (compatibility.assessment.conflicts.some((conflict) => conflict.initRejected === true)) {
    return { status: "rejected", reason: "illegal-combination", compatibility };
  }

  const decimals = input.decimals ?? DEFAULT_DECIMALS;
  const recognized = compatibility.recognized;
  // Keep catalog order for a deterministic, init-order-correct scaffold.
  const ordered = SPECS.map(([id]) => id).filter((id) => recognized.includes(id));
  const scaffoldable = ordered;
  const unsupported = recognized.filter((id) => !SPEC_BY_ID.has(id));

  const steps = buildSteps(scaffoldable, decimals);
  const code = buildCode(scaffoldable, unsupported, decimals);

  return { status: "ok", recognized, scaffoldable, unsupported, decimals, steps, code, compatibility };
}

function buildSteps(scaffoldable: string[], decimals: number): MintInitStep[] {
  const before = scaffoldable.filter((id) => SPEC_BY_ID.get(id)?.phase === "before-init-mint");
  const after = scaffoldable.filter((id) => SPEC_BY_ID.get(id)?.phase === "after-init-mint");
  const steps: MintInitStep[] = [];
  let order = 1;
  const usesMetadata = scaffoldable.includes("token-metadata");

  steps.push({
    order: order++,
    phase: "create-account",
    instruction: "SystemProgram.createAccount",
    note: usesMetadata
      ? "space = getMintLen(fixed extensions); fund rent for space + the token-metadata length"
      : "space = getMintLen(fixed extensions); fund rent for space",
  });
  for (const id of before) {
    const spec = SPEC_BY_ID.get(id);
    if (spec !== undefined) {
      steps.push({ order: order++, phase: "before-init-mint", instruction: spec.initFunction, note: `${id}: ${spec.note}` });
    }
  }
  steps.push({
    order: order++,
    phase: "init-mint",
    instruction: "createInitializeMint2Instruction",
    note: `decimals ${decimals}; runs after all fixed-length extensions are initialized`,
  });
  for (const id of after) {
    const spec = SPEC_BY_ID.get(id);
    if (spec !== undefined) {
      steps.push({ order: order++, phase: "after-init-mint", instruction: spec.initFunction, note: `${id}: ${spec.note}` });
    }
  }
  return steps;
}

function buildCode(scaffoldable: string[], unsupported: string[], decimals: number): string {
  const specs = scaffoldable.map((id) => SPEC_BY_ID.get(id)).filter((spec): spec is MintExtensionSpec => spec !== undefined);
  const usesMetadata = scaffoldable.includes("token-metadata");
  const usesDefaultState = scaffoldable.includes("default-account-state");

  const splFunctions = new Set<string>(["getMintLen", "createInitializeMint2Instruction"]);
  for (const spec of specs) {
    if (spec.initModule === "@solana/spl-token") {
      splFunctions.add(spec.initFunction);
    }
  }
  if (usesMetadata) {
    splFunctions.add("TYPE_SIZE");
    splFunctions.add("LENGTH_SIZE");
  }
  const splImports = ["ExtensionType", "TOKEN_2022_PROGRAM_ID", ...(usesDefaultState ? ["AccountState"] : []), ...[...splFunctions].sort()];

  const lengthTypes = specs.map((spec) => spec.lengthType).filter((name): name is string => name !== null);
  const placeholders = dedupe(specs.flatMap((spec) => spec.placeholders));
  const beforeCalls = specs.filter((spec) => spec.phase === "before-init-mint").map((spec) => spec.call);
  const afterCalls = specs.filter((spec) => spec.phase === "after-init-mint").map((spec) => spec.call);

  const lines: string[] = [];
  lines.push(`// Token-2022 mint scaffold for: ${scaffoldable.join(", ") || "(no scaffoldable extensions)"}`);
  lines.push("// Generated by the mint-inspector scaffold tool. Fill every REPLACE_/placeholder value.");
  lines.push("// Init order is load-bearing: fixed-length extensions before InitializeMint, token");
  lines.push("// metadata after it, all in one transaction. Source: solana.com Token-2022 guide.");
  if (unsupported.length > 0) {
    lines.push(`// NOTE: add these recognized extensions manually (no scaffold spec): ${unsupported.join(", ")}.`);
  }
  lines.push("");
  lines.push('import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";');
  lines.push(`import {\n  ${splImports.join(",\n  ")},\n} from "@solana/spl-token";`);
  if (usesMetadata) {
    lines.push('import { createInitializeInstruction as createInitializeMetadataInstruction, pack } from "@solana/spl-token-metadata";');
  }
  lines.push("");
  lines.push(`const DECIMALS = ${decimals};`);
  lines.push('const AUTHORITY = new PublicKey("REPLACE_authority"); // mint, freeze, and extension authority');
  for (const placeholder of placeholders) {
    lines.push(placeholder);
  }
  lines.push("");
  lines.push("// Returns the mint keypair and the ordered instructions; sign and send with your payer.");
  lines.push("export function buildMintInstructions(payer: PublicKey) {");
  lines.push("  const mintKeypair = Keypair.generate();");
  lines.push("  const mint = mintKeypair.publicKey;");
  lines.push("  const authority = AUTHORITY;");
  lines.push(`  const extensionTypes = [${lengthTypes.map((name) => `ExtensionType.${name}`).join(", ")}];`);
  lines.push("  const space = getMintLen(extensionTypes);");
  if (usesMetadata) {
    lines.push("  // Token metadata is variable length; size rent for the mint plus the packed metadata.");
    lines.push("  const metadata = { mint, name: TOKEN_NAME, symbol: TOKEN_SYMBOL, uri: TOKEN_URI, additionalMetadata: [] as [string, string][] };");
    lines.push("  const metadataLength = TYPE_SIZE + LENGTH_SIZE + pack({ ...metadata, updateAuthority: authority }).length;");
    lines.push("  const rentSpace = space + metadataLength;");
  } else {
    lines.push("  const rentSpace = space;");
  }
  lines.push("  const instructions = [");
  lines.push("    SystemProgram.createAccount({");
  lines.push("      fromPubkey: payer,");
  lines.push("      newAccountPubkey: mint,");
  lines.push("      space,");
  lines.push("      // lamports: await connection.getMinimumBalanceForRentExemption(rentSpace),");
  lines.push("      lamports: 0, // REPLACE with the rent for rentSpace");
  lines.push("      programId: TOKEN_2022_PROGRAM_ID,");
  lines.push("    }),");
  for (const call of beforeCalls) {
    lines.push(`    ${call},`);
  }
  lines.push("    createInitializeMint2Instruction(mint, DECIMALS, authority, authority, TOKEN_2022_PROGRAM_ID),");
  for (const call of afterCalls) {
    lines.push(`    ${call},`);
  }
  lines.push("  ];");
  lines.push("  return { mint, mintKeypair, instructions };");
  lines.push("}");
  return lines.join("\n");
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

// A compact, agent-consumable projection of a scaffold result, for MCP structuredContent.
export type GenerateMintSummary = {
  status: "ok" | "rejected";
  reason?: string;
  recognized: string[];
  scaffoldable: string[];
  unsupported: string[];
  stepCount: number;
};

/** Project a scaffold result to its compact summary. */
export function generateMintSummary(result: GenerateMintResult): GenerateMintSummary {
  if (result.status === "rejected") {
    return { status: "rejected", reason: result.reason, recognized: result.compatibility.recognized, scaffoldable: [], unsupported: [], stepCount: 0 };
  }
  return {
    status: "ok",
    recognized: result.recognized,
    scaffoldable: result.scaffoldable,
    unsupported: result.unsupported,
    stepCount: result.steps.length,
  };
}

/** Render a scaffold result as an aligned plain-text report. */
export function formatGenerateReport(result: GenerateMintResult): string {
  if (result.status === "rejected") {
    const lines: string[] = [];
    lines.push("Token-2022 mint scaffold: REJECTED");
    if (result.reason === "unrecognized-extension") {
      lines.push(`  Unrecognized extension ids: ${result.compatibility.unrecognized.join(", ")}`);
      lines.push("  Fix the spelling and try again; no code is generated for an unknown set.");
    } else {
      lines.push("  The set is rejected by the runtime at initialization (InvalidExtensionCombination):");
      for (const conflict of result.compatibility.assessment.conflicts.filter((entry) => entry.initRejected === true)) {
        lines.push(`    - ${conflict.title}`);
      }
      lines.push("  No code is generated for an illegal set.");
    }
    return lines.join("\n");
  }

  const lines: string[] = [];
  lines.push("Token-2022 mint scaffold");
  lines.push(`  Extensions:   ${result.scaffoldable.join(", ") || "none"}`);
  if (result.unsupported.length > 0) {
    lines.push(`  Add manually: ${result.unsupported.join(", ")} (recognized, but no scaffold spec)`);
  }
  lines.push(`  Decimals:     ${result.decimals}`);
  lines.push("");
  lines.push("Init plan (order is load-bearing):");
  for (const step of result.steps) {
    lines.push(`  ${step.order}. [${step.phase}] ${step.instruction}`);
    lines.push(`       ${step.note}`);
  }
  lines.push("");
  lines.push("Scaffold:");
  lines.push(result.code);
  return lines.join("\n");
}
