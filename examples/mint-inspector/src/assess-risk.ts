/**
 * Turn a decoded extension set into integration findings, cross-extension
 * conflicts, and a wallet/DEX/CEX posture. Pure and deterministic.
 *
 * Conditional severity: a fund-loss-grade extension is dangerous only while its
 * controlling authority is live. A renounced (null) authority makes the power
 * dormant, so the finding is downgraded. This mirrors how real integrators triage
 * a mint: Jupiter restricts transfer-fee tokens from resting (Limit/Recurring)
 * orders specifically because a live fee-config authority can change the rate at
 * any time, while a renounced one cannot.
 * Source: docs.jup.ag transfer-tax support, solana.com transfer-fee guide,
 * neodyme.io/en/blog/token-2022 (permanent delegate has unlimited access).
 *
 * Every rule cites the skill document that backs its claim, so the executable
 * assessment and the written guidance stay in sync.
 * Sources: skill/compatibility-matrix.md, skill/integration-compatibility.md,
 * skill/confidential-transfer.md, skill/supply-controls.md, skill/value-extensions.md,
 * skill/metadata-and-groups.md, skill/transfer-hook-security.md.
 */

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type IntegrationSurface = "wallet" | "dex" | "cex";

export type Finding = {
  extension: string;
  severity: Severity;
  surfaces: IntegrationSurface[];
  title: string;
  detail: string;
  // A concrete next step the holder, integrator, or issuer can take.
  remediation: string;
  sourceRef: string;
};

export type Conflict = {
  extensions: string[];
  severity: Severity;
  title: string;
  detail: string;
  sourceRef: string;
  // True when the runtime rejects this combination at initialization
  // (TokenError::InvalidExtensionCombination), so a generator must refuse to scaffold
  // it. Absent for logical-smell pairs the program still lets you initialize.
  initRejected?: boolean;
};

export type Posture = {
  overallSeverity: Severity;
  // 0 to 100, summed from per-finding and per-conflict weights, capped at 100.
  // The severity tier is the headline; the score is a secondary sort key.
  score: number;
  cexBlockers: string[];
  dexFrictions: string[];
  walletCaveats: string[];
};

export type Assessment = {
  findings: Finding[];
  conflicts: Conflict[];
  posture: Posture;
};

// A present extension plus whether its controlling authority is renounced. When
// authorityRenounced is undefined (a planned set with no live mint), the authority
// is treated as live, the conservative default.
// Magnitude of a transfer fee, used to escalate severity beyond the authority
// model: a near-100% fee is a sell-blocking honeypot no matter who controls it.
export type TransferFeeParams = {
  // The fee in effect now, in basis points (10000 = 100%).
  activeBasisPoints: number;
  // A different fee scheduled for a future epoch, if one is pending; otherwise null.
  scheduledBasisPoints: number | null;
};

export type AssessedExtension = {
  id: string;
  authorityRenounced?: boolean;
  // Present for the transfer-fee extension when decoded from a live mint, so the
  // assessment can weigh the fee size, not just who controls the authority.
  transferFee?: TransferFeeParams;
};

// The base mint authorities, known only when inspecting a live mint.
export type MintAuthorityLiveness = {
  mintAuthorityLive: boolean;
  freezeAuthorityLive: boolean;
};

// One "what if I renounce this authority" projection: the posture the mint would
// have if a single currently-live authority were set to none.
export type RenounceProjection = {
  // The authority to renounce: an extension id (for example "permanent-delegate")
  // or a base authority key ("mint-authority", "freeze-authority").
  target: string;
  afterSeverity: Severity;
  afterScore: number;
};

// A remediation path: the current posture, the projection for each renounceable
// live authority (biggest reduction first), and the posture if all were renounced.
export type Remediation = {
  currentSeverity: Severity;
  currentScore: number;
  steps: RenounceProjection[];
  // The all-at-once projection, present only when more than one step exists (with a
  // single step the step itself already shows the fully remediated posture).
  allRenounced: { afterSeverity: Severity; afterScore: number } | null;
};

type RenouncedOverride = {
  severity: Severity;
  detail: string;
  remediation: string;
};

type RiskRule = {
  severity: Severity;
  surfaces: IntegrationSurface[];
  title: string;
  detail: string;
  remediation: string;
  sourceRef: string;
  // A CEX deposit/withdrawal listing is the strictest surface. "blocker" means the
  // trust model commonly disqualifies a listing; "friction" means extra handling.
  cexImpact?: "blocker" | "friction";
  // The detail key from decode-mint that holds this extension's controlling
  // authority. When that value is "none" the authority is renounced and the
  // renounced override applies. Documented here; liveness is computed in inspect.ts.
  controllingAuthorityKey?: string;
  // Severity, detail, and remediation when the controlling authority is renounced.
  renounced?: RenouncedOverride;
};

// Keyed by the extension ids from extension-catalog.ts.
const RISK_RULES: Record<string, RiskRule> = {
  "permanent-delegate": {
    severity: "critical",
    surfaces: ["wallet", "dex", "cex"],
    cexImpact: "blocker",
    controllingAuthorityKey: "delegate",
    title: "Permanent delegate can seize or burn any balance",
    detail:
      "A live permanent delegate can transfer or burn tokens from any account of this mint, and account owners cannot revoke it. It survives a renounced mint and freeze authority and locked liquidity. This is the marquee fund-loss extension; custodians and exchanges treat it as full trust in the mint's controllers.",
    remediation:
      "Renounce the permanent delegate (set it to none) unless seizure is an intended, disclosed feature; if it must stay, document who holds it and why.",
    sourceRef: "skill/supply-controls.md, skill/integration-compatibility.md",
    renounced: {
      severity: "low",
      detail:
        "The permanent-delegate extension is present but no delegate is set, so no one can seize balances today. Confirm it stays null; the mint authority could rotate a delegate in via SetAuthority.",
      remediation: "Verify the delegate stays null and that no authority can set one without disclosure.",
    },
  },
  "transfer-hook": {
    severity: "high",
    surfaces: ["wallet", "dex", "cex"],
    cexImpact: "blocker",
    controllingAuthorityKey: "programId",
    title: "Transfer hook runs on every transfer",
    detail:
      "An active hook program is invoked on every transfer and needs its extra accounts resolved and simulated. Many DEXs and wallets need explicit support and some venues reject hooks outright. Audit the hook program before trusting it.",
    remediation:
      "Audit the hook program and its ExtraAccountMetaList, simulate a full transfer including the hook before integrating, and confirm the hook gates on the transferring flag and the mint linkage.",
    sourceRef: "skill/integration-compatibility.md, skill/transfer-hook-security.md",
    renounced: {
      severity: "medium",
      detail:
        "The transfer-hook extension is present but no hook program is set, so transfers run normally today. The hook authority can set a program at any time, which would then gate every transfer, so treat it as a latent caveat rather than an active block.",
      remediation: "If no hook is intended, renounce the hook authority; otherwise monitor for a program being set and re-audit when it is.",
    },
  },
  "confidential-transfer": {
    severity: "medium",
    surfaces: ["wallet", "dex", "cex"],
    cexImpact: "friction",
    title: "Confidential transfer extension present",
    detail:
      "Confidential transfers hide transfer amounts behind ElGamal ciphertext and zero-knowledge proofs. The ZK ElGamal Proof Program they depend on was re-enabled on mainnet-beta on 2026-06-04 (feature gate reenable_zk_elgamal_proof_program, activation slot 424224000), ending the disablement that ran from 2025-06-19 after a proof-soundness bug. Balances are opt-in per holder and not publicly visible, so wallet and DEX support is narrow and a CEX cannot reconcile balances for accounting or AML without the auditor key. Treat it as an integration and compliance constraint, not a fund-loss risk to holders.",
    remediation:
      "Confirm your wallet, DEX, and custody stack support confidential balances before relying on them, and verify end to end on mainnet since tooling is still catching up after re-enablement; for a CEX listing, expect a compliance review of the opaque-balance and auditor-key model.",
    sourceRef: "skill/confidential-transfer.md",
  },
  pausable: {
    severity: "high",
    surfaces: ["dex", "cex"],
    cexImpact: "blocker",
    controllingAuthorityKey: "authority",
    title: "Pausable: transfers can be halted",
    detail:
      "While paused, the program aborts all transfers, mints, and burns. A live pause authority can halt the token at any time, so custodians treat it as a trust concern that often blocks a listing.",
    remediation:
      "Renounce the pause authority unless an emergency stop is a disclosed, governed feature; integrators must handle the paused state gracefully.",
    sourceRef: "skill/compatibility-matrix.md, skill/integration-compatibility.md",
    renounced: {
      severity: "low",
      detail: "The pausable extension is present but no pause authority is set, so transfers cannot be halted.",
      remediation: "Confirm the pause authority stays null.",
    },
  },
  "non-transferable": {
    severity: "medium",
    surfaces: ["dex", "cex"],
    cexImpact: "blocker",
    title: "Non-transferable (soulbound) token",
    detail:
      "The token cannot be transferred, so it cannot trade on a DEX or list on a CEX by design. Only mint and burn move supply.",
    remediation: "Expect no secondary market; use it only where a soulbound credential or badge is intended.",
    sourceRef: "skill/supply-controls.md",
  },
  "transfer-fee": {
    severity: "medium",
    surfaces: ["dex", "cex"],
    cexImpact: "friction",
    controllingAuthorityKey: "feeConfigAuthority",
    title: "Transfer fee is withheld on receive",
    detail:
      "The fee is taken from the received amount and withheld on the recipient account, not charged to the sender separately. A live fee-config authority can raise the rate (subject to a roughly two-epoch delay and the maximum-fee cap), so integrators treat resting orders as carrying execution-time uncertainty; Jupiter excludes such tokens from Limit and Recurring orders while allowing Instant swaps.",
    remediation:
      "Use the net received amount in escrow and routing math, harvest withheld fees before closing accounts, and renounce the fee-config authority to lock the rate if integrators need certainty.",
    sourceRef: "skill/transfer-fee.md, skill/integration-compatibility.md",
    renounced: {
      severity: "low",
      detail:
        "A transfer fee is withheld on the received amount, but the fee-config authority is renounced, so the rate is locked and cannot be raised. Integrators still use the net received amount and harvest withheld fees before closing accounts.",
      remediation: "Use the net received amount in escrow and routing math and harvest withheld fees before closing accounts.",
    },
  },
  "default-account-state": {
    severity: "medium",
    surfaces: ["wallet", "dex"],
    title: "New accounts may be frozen by default",
    detail:
      "Holders may need the freeze authority to thaw their account before they can transact. Vault and transfer logic can strand funds if it does not thaw accounts first.",
    remediation: "Thaw a new account before crediting it, and check the freeze authority is one you trust to thaw promptly.",
    sourceRef: "skill/compatibility-matrix.md",
  },
  "mint-close-authority": {
    severity: "low",
    surfaces: ["cex"],
    cexImpact: "friction",
    controllingAuthorityKey: "closeAuthority",
    title: "Mint can be closed at zero supply",
    detail:
      "The close authority can reclaim the mint account once supply is zero. Integrators that track the mint should handle its possible closure.",
    remediation: "Handle a possible mint closure in indexers and integrations; renounce the close authority if the mint should be permanent.",
    sourceRef: "skill/supply-controls.md",
    renounced: {
      severity: "info",
      detail: "The mint-close-authority extension is present but no close authority is set, so the mint cannot be closed.",
      remediation: "No action needed; the mint cannot be closed.",
    },
  },
  "interest-bearing": {
    severity: "low",
    surfaces: ["wallet", "dex"],
    controllingAuthorityKey: "rateAuthority",
    title: "Interest-bearing: UI amount drifts from raw amount",
    detail:
      "The displayed UI amount differs from the raw amount and changes over time. Integrators must convert with the amount-to-UI helper. The raw supply does not change.",
    remediation: "Display the UI amount with the interest-bearing conversion helper and settle on the raw base-unit balance.",
    sourceRef: "skill/value-extensions.md",
    renounced: {
      severity: "info",
      detail: "Interest-bearing display is active but the rate authority is renounced, so the rate is locked. Convert with the amount-to-UI helper; settle on raw base units.",
      remediation: "Display the UI amount with the conversion helper and settle on raw base units.",
    },
  },
  "scaled-ui-amount": {
    severity: "low",
    surfaces: ["wallet", "dex"],
    controllingAuthorityKey: "authority",
    title: "Scaled UI amount: display is multiplied",
    detail:
      "The UI amount is the raw amount times a multiplier the authority can update. Integrators must use the UI-amount conversion. The raw supply does not change.",
    remediation: "Display the UI amount with the scaled-UI conversion helper and settle on the raw base-unit balance.",
    sourceRef: "skill/value-extensions.md",
    renounced: {
      severity: "info",
      detail: "A scaled UI multiplier is active but its authority is renounced, so the multiplier is locked. Convert with the UI-amount helper; settle on raw base units.",
      remediation: "Display the UI amount with the conversion helper and settle on raw base units.",
    },
  },
  "metadata-pointer": {
    severity: "info",
    surfaces: [],
    title: "Metadata pointer set",
    detail: "Points to where the token metadata lives. Widely supported by wallets and explorers.",
    remediation: "No action needed; confirm the pointer resolves to the expected metadata account.",
    sourceRef: "skill/metadata-and-groups.md",
  },
  "token-metadata": {
    severity: "info",
    surfaces: [],
    title: "On-chain token metadata",
    detail: "Metadata is stored on the mint itself. Widely supported by wallets and explorers.",
    remediation: "No action needed; verify the name, symbol, and uri are the expected values.",
    sourceRef: "skill/metadata-and-groups.md",
  },
  "group-pointer": {
    severity: "info",
    surfaces: [],
    title: "Group pointer set",
    detail: "Points to a token group account. Tooling support for groups varies.",
    remediation: "No action needed; confirm group tooling support before relying on it.",
    sourceRef: "skill/metadata-and-groups.md",
  },
  "token-group": {
    severity: "info",
    surfaces: [],
    title: "Token group configured",
    detail: "Declares this mint as a group with a member size. Tooling support for groups varies.",
    remediation: "No action needed; confirm group tooling support before relying on it.",
    sourceRef: "skill/metadata-and-groups.md",
  },
  "group-member-pointer": {
    severity: "info",
    surfaces: [],
    title: "Group member pointer set",
    detail: "Points to a group member account. Tooling support for groups varies.",
    remediation: "No action needed; confirm group tooling support before relying on it.",
    sourceRef: "skill/metadata-and-groups.md",
  },
  "token-group-member": {
    severity: "info",
    surfaces: [],
    title: "Token group member configured",
    detail: "Declares this mint as a member of a group. Tooling support for groups varies.",
    remediation: "No action needed; confirm group tooling support before relying on it.",
    sourceRef: "skill/metadata-and-groups.md",
  },
  "confidential-transfer-fee": {
    severity: "info",
    surfaces: [],
    title: "Confidential transfer fee configured",
    detail:
      "Holds the fee config applied when a transfer fee is collected on a confidential transfer. It appears alongside the confidential transfer extension on mints like PYUSD. The ZK ElGamal Proof Program these operations depend on was re-enabled on mainnet on 2026-06-04.",
    remediation: "No action needed; it applies only to confidential transfers, whose proof program was re-enabled on mainnet on 2026-06-04.",
    sourceRef: "skill/confidential-transfer.md",
  },
  "confidential-mint-burn": {
    severity: "info",
    surfaces: [],
    title: "Confidential mint and burn configured",
    detail:
      "Supports minting and burning against confidential balances. Like other confidential operations it depends on the ZK ElGamal Proof Program, re-enabled on mainnet on 2026-06-04 (issue token-2022#657).",
    remediation: "No action needed; confidential mint and burn depend on the ZK ElGamal Proof Program, re-enabled on mainnet on 2026-06-04.",
    sourceRef: "skill/confidential-transfer.md",
  },
  "permissioned-burn": {
    severity: "high",
    surfaces: ["wallet", "dex", "cex"],
    cexImpact: "blocker",
    title: "Permissioned burn lets an authority destroy holder balances",
    detail:
      "A newer Token-2022 extension (interface code 28, the highest defined) that gates burning behind a designated authority rather than the token holder, so that authority can burn tokens out of any holder's account. It is a constrained permanent delegate: it can destroy balances but not move them. Confirm who holds the burn authority, and that wallet, explorer, and custody tooling recognize the extension, before relying on it.",
    remediation: "Confirm who holds the burn authority and treat it as a custody trust concern; integrators and exchanges should account for balances being burnable by that authority.",
    sourceRef: "skill/supply-controls.md",
  },
  unrecognized: {
    severity: "low",
    surfaces: ["wallet", "dex"],
    title: "Unrecognized extension present",
    detail:
      "An extension code that this build does not map was found. The interface defines codes 0 to 28; a higher code implies a newer program than this build knows. Verify wallet and explorer support and confirm your @solana/spl-token version is current before relying on it.",
    remediation: "Upgrade @solana/spl-token to the current version and re-inspect; verify wallet and explorer support for the new extension.",
    sourceRef: "skill/compatibility-matrix.md",
  },
};

/** The decode-mint detail key that holds an extension's controlling authority, or null. */
export function controllingAuthorityKey(extensionId: string): string | null {
  return RISK_RULES[extensionId]?.controllingAuthorityKey ?? null;
}

type ConflictRule = {
  pair: [string, string];
  severity: Severity;
  title: string;
  detail: string;
  sourceRef: string;
};

const CONFLICT_RULES: ConflictRule[] = [
  {
    pair: ["non-transferable", "transfer-hook"],
    severity: "high",
    title: "Non-Transferable with Transfer Hook is logically incompatible",
    detail:
      "Non-Transferable blocks every transfer, so the hook can never run. The base program may still let the mint initialize, so treat this as a configuration smell, not an init error.",
    sourceRef: "skill/compatibility-matrix.md",
  },
  {
    pair: ["non-transferable", "transfer-fee"],
    severity: "medium",
    title: "Non-Transferable with Transfer Fee is pointless",
    detail: "A non-transferable token never transfers, so a transfer fee can never apply.",
    sourceRef: "skill/compatibility-matrix.md",
  },
  {
    // Verified against the Token-2022 source: confidential transfers and a hook
    // coexist on a mint (PYUSD ships both on mainnet). The hook still fires on a
    // confidential transfer, but the program passes it u64::MAX instead of the
    // real amount, so amount-dependent hook logic is bypassed on that path.
    // Source: program/src/extension/confidential_transfer/processor.rs (invoke_execute with u64::MAX).
    pair: ["confidential-transfer", "transfer-hook"],
    severity: "low",
    title: "Confidential Transfer with Transfer Hook: the hook sees no real amount on confidential transfers",
    detail:
      "The two are compatible and coexist on a mint (PYUSD carries both). The hook fires on every transfer, but on a confidential transfer Token-2022 passes the hook u64::MAX rather than the cleartext amount, so any hook rule that depends on the amount applies only to regular transfers, not confidential ones.",
    sourceRef: "skill/compatibility-matrix.md",
  },
];

// Mint extension combinations the Token-2022 runtime rejects at initialization with
// TokenError::InvalidExtensionCombination. For a decoded live mint these are
// effectively impossible (the mint could not have been created), so seeing one means
// a malformed or non-standard layout; for a planned set (the compatibility checker)
// they are exactly the build-time errors to catch. Each rule states the positive
// implication: what a valid configuration must include.
// Source: interface/src/extension/mod.rs check_for_invalid_mint_extension_combinations.
type CombinationRule = {
  // The extensions whose simultaneous presence triggers the check.
  ifAll: string[];
  // requireAll: every id here must also be present, or the combination is rejected.
  requireAll?: string[];
  // mutuallyExclusive: the ifAll set may not appear together at all.
  mutuallyExclusive?: true;
  severity: Severity;
  title: string;
  detail: string;
  sourceRef: string;
};

const COMBINATION_RULES: CombinationRule[] = [
  {
    ifAll: ["scaled-ui-amount", "interest-bearing"],
    mutuallyExclusive: true,
    severity: "high",
    title: "Scaled UI Amount with Interest-Bearing is rejected at init",
    detail:
      "Both extensions rewrite the displayed amount, so Token-2022 rejects a mint that declares both with InvalidExtensionCombination. Choose one display model: a fixed multiplier (Scaled UI Amount) or an accruing rate (Interest-Bearing).",
    sourceRef: "skill/compatibility-matrix.md",
  },
  {
    ifAll: ["confidential-transfer-fee"],
    requireAll: ["transfer-fee", "confidential-transfer"],
    severity: "high",
    title: "Confidential Transfer Fee requires Transfer Fee and Confidential Transfer",
    detail:
      "The confidential-transfer-fee config is only valid on a mint that also carries both the transfer-fee and confidential-transfer extensions; Token-2022 rejects it otherwise (InvalidExtensionCombination). Add both, or drop the confidential transfer fee.",
    sourceRef: "skill/compatibility-matrix.md",
  },
  {
    ifAll: ["transfer-fee", "confidential-transfer"],
    requireAll: ["confidential-transfer-fee"],
    severity: "high",
    title: "Transfer Fee with Confidential Transfer requires the Confidential Transfer Fee config",
    detail:
      "A mint that combines a transfer fee with confidential transfers must also carry the confidential-transfer-fee config so fees can be collected on confidential transfers; Token-2022 rejects the pair without it. A mint showing this pair without the confidential transfer fee (PYUSD carries all three) is a non-standard or malformed layout.",
    sourceRef: "skill/compatibility-matrix.md",
  },
  {
    ifAll: ["confidential-mint-burn"],
    requireAll: ["confidential-transfer"],
    severity: "high",
    title: "Confidential Mint and Burn requires Confidential Transfer",
    detail:
      "Confidential mint and burn operate on confidential balances, so the mint must also enable the confidential-transfer extension; Token-2022 rejects it otherwise (InvalidExtensionCombination).",
    sourceRef: "skill/compatibility-matrix.md",
  },
  {
    ifAll: ["non-transferable", "confidential-transfer"],
    requireAll: ["confidential-mint-burn"],
    severity: "high",
    title: "Non-Transferable with Confidential Transfer requires Confidential Mint and Burn",
    detail:
      "A non-transferable mint that enables confidential transfers must also enable confidential mint and burn, since supply can then move only through mint and burn; Token-2022 rejects the pair without it (InvalidExtensionCombination).",
    sourceRef: "skill/compatibility-matrix.md",
  },
];

/** Evaluate the runtime-rejected combination rules against a present-extension set. */
function combinationConflicts(present: Set<string>): Conflict[] {
  const conflicts: Conflict[] = [];
  for (const rule of COMBINATION_RULES) {
    if (!rule.ifAll.every((id) => present.has(id))) {
      continue;
    }
    const violated =
      rule.mutuallyExclusive === true ? true : (rule.requireAll ?? []).some((id) => !present.has(id));
    if (!violated) {
      continue;
    }
    conflicts.push({
      extensions: rule.ifAll,
      severity: rule.severity,
      title: rule.title,
      detail: rule.detail,
      sourceRef: rule.sourceRef,
      initRejected: true,
    });
  }
  return conflicts;
}

const SEVERITY_RANK: Record<Severity, number> = { info: 0, low: 1, medium: 2, high: 3, critical: 4 };

// Per-item contribution to the 0-100 score. A single live permanent delegate
// (critical) saturates the score on its own; a metadata-only mint scores 0.
const SEVERITY_SCORE: Record<Severity, number> = { info: 0, low: 5, medium: 15, high: 35, critical: 100 };

/** Numeric rank for a severity, so callers can sort and take the maximum. */
export function severityRank(severity: Severity): number {
  return SEVERITY_RANK[severity];
}

function maxSeverity(severities: Severity[]): Severity {
  return severities.reduce<Severity>(
    (max, severity) => (severityRank(severity) > severityRank(max) ? severity : max),
    "info",
  );
}

function scoreOf(severities: Severity[]): number {
  const total = severities.reduce((sum, severity) => sum + SEVERITY_SCORE[severity], 0);
  return Math.min(100, total);
}

// Transfer-fee magnitude thresholds (basis points; the program cap
// MAX_FEE_BASIS_POINTS is 10000 = 100%). A fee that takes most of every transfer
// makes the token effectively untradeable no matter who holds the authority, so the
// magnitude escalates severity on its own. These cut points are heuristics.
// Source: spl-token-2022 transfer_fee MAX_FEE_BASIS_POINTS = 10000.
const HONEYPOT_FEE_BASIS_POINTS = 9000; // >= 90%: a sell-blocking honeypot
const SEVERE_FEE_BASIS_POINTS = 5000; // >= 50%: a severe value drag

/** Severity implied by a fee size alone, ignoring the authority. */
function feeMagnitudeSeverity(basisPoints: number): Severity {
  if (basisPoints >= HONEYPOT_FEE_BASIS_POINTS) {
    return "critical";
  }
  if (basisPoints >= SEVERE_FEE_BASIS_POINTS) {
    return "high";
  }
  return "info";
}

/**
 * Build the transfer-fee finding with magnitude awareness. The authority-based
 * severity (a live fee-config authority can raise the rate; a renounced one locks
 * it) is escalated by the active and any scheduled fee size, because a near-100%
 * fee is a sell-blocking honeypot even when the rate is locked.
 */
function buildTransferFeeFinding(extension: AssessedExtension, rule: RiskRule, fee: TransferFeeParams): Finding {
  const isRenounced = extension.authorityRenounced === true && rule.renounced !== undefined;
  const override = isRenounced ? rule.renounced : undefined;
  const baseSeverity = override ? override.severity : rule.severity;
  const scheduled = fee.scheduledBasisPoints;
  const severity = maxSeverity([
    baseSeverity,
    feeMagnitudeSeverity(fee.activeBasisPoints),
    scheduled === null ? "info" : feeMagnitudeSeverity(scheduled),
  ]);

  const notes: string[] = [];
  if (feeMagnitudeSeverity(fee.activeBasisPoints) !== "info") {
    notes.push(
      `The active fee is ${fee.activeBasisPoints} bps (${(fee.activeBasisPoints / 100).toFixed(2)}%), high enough to make the token hard or impossible to sell; this holds whether or not the fee-config authority is renounced, since the rate is already set this high.`,
    );
  }
  if (scheduled !== null) {
    notes.push(
      `A fee change to ${scheduled} bps (${(scheduled / 100).toFixed(2)}%) is scheduled for a future epoch; treat the higher of the current and scheduled rate as the effective risk.`,
    );
  }
  const detail = override ? override.detail : rule.detail;
  return {
    extension: extension.id,
    severity,
    surfaces: rule.surfaces,
    title: rule.title,
    detail: notes.length === 0 ? detail : `${detail} ${notes.join(" ")}`,
    remediation: override ? override.remediation : rule.remediation,
    sourceRef: rule.sourceRef,
  };
}

/**
 * Assess a set of extensions into findings, conflicts, and an overall posture.
 * Accepts plain ids (planned set, authorities assumed live) or AssessedExtension
 * objects carrying authority liveness. When mintAuthorities is given (a live mint),
 * the base mint and freeze authorities are assessed too.
 */
export function assessExtensions(
  extensions: Array<string | AssessedExtension>,
  mintAuthorities?: MintAuthorityLiveness,
): Assessment {
  const normalized: AssessedExtension[] = extensions.map((extension) =>
    typeof extension === "string" ? { id: extension } : extension,
  );
  const present = new Set(normalized.map((extension) => extension.id));

  const findings: Finding[] = [];
  for (const extension of normalized) {
    const rule = RISK_RULES[extension.id];
    if (rule === undefined) {
      continue;
    }
    // The transfer fee weighs its size (a near-100% fee is a honeypot), not just
    // the authority, so it has its own builder when fee params are known.
    if (extension.id === "transfer-fee" && extension.transferFee !== undefined) {
      findings.push(buildTransferFeeFinding(extension, rule, extension.transferFee));
      continue;
    }
    const isRenounced = extension.authorityRenounced === true && rule.renounced !== undefined;
    const override = isRenounced ? rule.renounced : undefined;
    findings.push({
      extension: extension.id,
      severity: override ? override.severity : rule.severity,
      surfaces: rule.surfaces,
      title: rule.title,
      detail: override ? override.detail : rule.detail,
      remediation: override ? override.remediation : rule.remediation,
      sourceRef: rule.sourceRef,
    });
  }

  if (mintAuthorities !== undefined) {
    findings.push(...baseAuthorityFindings(mintAuthorities));
  }

  findings.sort((left, right) => severityRank(right.severity) - severityRank(left.severity));

  const conflicts: Conflict[] = [];
  for (const conflictRule of CONFLICT_RULES) {
    const [first, second] = conflictRule.pair;
    if (present.has(first) && present.has(second)) {
      conflicts.push({
        extensions: [first, second],
        severity: conflictRule.severity,
        title: conflictRule.title,
        detail: conflictRule.detail,
        sourceRef: conflictRule.sourceRef,
      });
    }
  }
  conflicts.push(...combinationConflicts(present));

  return { findings, conflicts, posture: computePosture(findings, conflicts) };
}

/**
 * Project how the posture would change if each currently-live, renounceable
 * authority were renounced one at a time, plus the all-at-once result. It reuses
 * assessExtensions for every projection, so the path can never diverge from the
 * verdict. An authority is renounceable when its rule defines a renounced override
 * (a permanent delegate, a transfer hook, a fee-config authority, a pause
 * authority, and so on) and it is not already renounced; the base mint and freeze
 * authorities are included when their liveness is known.
 */
export function projectRenouncements(
  extensions: AssessedExtension[],
  mintAuthorities?: MintAuthorityLiveness,
  persistentFindings: Finding[] = [],
): Remediation {
  // Fold any non-renounceable persistent findings (for example a second-hop
  // hook-program mutability finding) into every projected posture, so the
  // remediation's current and floor match the enriched headline verdict and reflect
  // risk the issuer cannot renounce away. With no persistent findings this is exactly
  // assessExtensions(...).posture, so the base behavior is unchanged.
  const postureWith = (exts: AssessedExtension[], auth: MintAuthorityLiveness | undefined): Posture =>
    withAdditionalFindings(assessExtensions(exts, auth), persistentFindings).posture;
  const current = postureWith(extensions, mintAuthorities);
  const steps: RenounceProjection[] = [];

  for (const extension of extensions) {
    const rule = RISK_RULES[extension.id];
    // No renounced override means renouncing this authority changes nothing.
    if (rule?.renounced === undefined || extension.authorityRenounced === true) {
      continue;
    }
    const projected = extensions.map((candidate) =>
      candidate.id === extension.id ? { ...candidate, authorityRenounced: true } : candidate,
    );
    const posture = postureWith(projected, mintAuthorities);
    steps.push({ target: extension.id, afterSeverity: posture.overallSeverity, afterScore: posture.score });
  }

  if (mintAuthorities?.mintAuthorityLive === true) {
    const posture = postureWith(extensions, { ...mintAuthorities, mintAuthorityLive: false });
    steps.push({ target: "mint-authority", afterSeverity: posture.overallSeverity, afterScore: posture.score });
  }
  if (mintAuthorities?.freezeAuthorityLive === true) {
    const posture = postureWith(extensions, { ...mintAuthorities, freezeAuthorityLive: false });
    steps.push({ target: "freeze-authority", afterSeverity: posture.overallSeverity, afterScore: posture.score });
  }

  // Lead with the action that most lowers the verdict: lowest projected severity
  // first, then lowest score, then target id for a deterministic order. Severity is
  // the primary key because the score saturates at 100, so a renounce that drops the
  // tier (CRITICAL to HIGH) still leads even when other findings keep the score pinned.
  steps.sort((left, right) => {
    const severityDelta = severityRank(left.afterSeverity) - severityRank(right.afterSeverity);
    if (severityDelta !== 0) {
      return severityDelta;
    }
    if (left.afterScore !== right.afterScore) {
      return left.afterScore - right.afterScore;
    }
    return left.target.localeCompare(right.target);
  });

  let allRenounced: { afterSeverity: Severity; afterScore: number } | null = null;
  if (steps.length > 1) {
    const projectedExtensions = extensions.map((candidate) =>
      RISK_RULES[candidate.id]?.renounced === undefined ? candidate : { ...candidate, authorityRenounced: true },
    );
    const projectedAuthorities =
      mintAuthorities === undefined ? undefined : { mintAuthorityLive: false, freezeAuthorityLive: false };
    const posture = postureWith(projectedExtensions, projectedAuthorities);
    allRenounced = { afterSeverity: posture.overallSeverity, afterScore: posture.score };
  }

  return { currentSeverity: current.overallSeverity, currentScore: current.score, steps, allRenounced };
}

// Findings for the base mint authorities (mint and freeze), which are not
// extensions but are exactly what an integrator checks for fund control.
function baseAuthorityFindings(authorities: MintAuthorityLiveness): Finding[] {
  const findings: Finding[] = [];
  findings.push(
    authorities.mintAuthorityLive
      ? {
          extension: "mint-authority",
          severity: "low",
          surfaces: [],
          title: "Mint authority is live (supply is not fixed)",
          detail: "A live mint authority can mint more tokens, so the supply is not fixed. Common and often legitimate, but account for inflation.",
          remediation: "Confirm you trust the mint authority; renounce it to fix the supply if a fixed cap is intended.",
          sourceRef: "skill/supply-controls.md",
        }
      : {
          extension: "mint-authority",
          severity: "info",
          surfaces: [],
          title: "Mint authority renounced (fixed supply)",
          detail: "No mint authority is set, so no more tokens can be minted and the supply is fixed.",
          remediation: "No action needed; the supply is fixed.",
          sourceRef: "skill/supply-controls.md",
        },
  );
  if (authorities.freezeAuthorityLive) {
    findings.push({
      extension: "freeze-authority",
      severity: "medium",
      surfaces: ["wallet", "cex"],
      title: "Freeze authority is live (accounts can be frozen)",
      detail: "A live freeze authority can freeze any token account of this mint, blocking that holder from sending or receiving until it is thawed.",
      remediation: "Confirm you trust the freeze authority; renounce it if accounts should never be freezable.",
      sourceRef: "skill/supply-controls.md",
    });
  }
  return findings;
}

/** Whether a finding disqualifies (or would disqualify) a CEX listing. */
function isCexBlocker(finding: Finding): boolean {
  // The hook-program finding is synthetic (a second-hop read, not a decoded
  // extension), so it is not in RISK_RULES: an upgradeable hook (high) blocks a
  // listing because the audited bytecode can be swapped after the fact.
  if (finding.extension === "transfer-hook-program") {
    return severityRank(finding.severity) >= severityRank("high");
  }
  const rule = RISK_RULES[finding.extension];
  if (rule === undefined) {
    return false;
  }
  // A transfer fee escalated to high or critical by its own magnitude blocks a
  // listing even though a normal fee is only friction: a near-100% fee makes the
  // token effectively untradeable.
  if (finding.extension === "transfer-fee" && severityRank(finding.severity) >= severityRank("high")) {
    return true;
  }
  // Otherwise a finding blocks only if its rule marks it a blocker and it has not
  // been downgraded below its live (base) severity by a renounced authority.
  return rule.cexImpact === "blocker" && severityRank(finding.severity) >= severityRank(rule.severity);
}

function computePosture(findings: Finding[], conflicts: Conflict[]): Posture {
  const cexBlockers = dedupe(findings.filter(isCexBlocker).map((finding) => finding.extension));
  const dexFrictions = dedupe(findings.filter((finding) => finding.surfaces.includes("dex")).map((finding) => finding.extension));
  const walletCaveats = dedupe(findings.filter((finding) => finding.surfaces.includes("wallet")).map((finding) => finding.extension));

  const severities: Severity[] = [
    ...findings.map((finding) => finding.severity),
    ...conflicts.map((conflict) => conflict.severity),
  ];

  return {
    overallSeverity: maxSeverity(severities),
    score: scoreOf(severities),
    cexBlockers,
    dexFrictions,
    walletCaveats,
  };
}

/**
 * Append second-hop findings (for example a hook-program mutability finding) to an
 * assessment and recompute its posture only. The remediation projection is recomputed
 * separately by the caller via projectRenouncements with the same findings passed as
 * persistent, so the headline verdict and the remediation stay consistent.
 */
export function withAdditionalFindings(assessment: Assessment, extraFindings: Finding[]): Assessment {
  if (extraFindings.length === 0) {
    return assessment;
  }
  const findings = [...assessment.findings, ...extraFindings].sort(
    (left, right) => severityRank(right.severity) - severityRank(left.severity),
  );
  return { findings, conflicts: assessment.conflicts, posture: computePosture(findings, assessment.conflicts) };
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

export type AccountAssessment = {
  findings: Finding[];
  overallSeverity: Severity;
  score: number;
};

export type TokenAccountInput = {
  extensionIds: string[];
  isFrozen: boolean;
  withheldAmount: string | null;
};

// Notes for the account-level extensions a token account can carry. Keyed by the
// account-surface ids from extension-catalog.ts.
const ACCOUNT_NOTES: Record<string, Omit<Finding, "extension">> = {
  "cpi-guard": {
    severity: "info",
    surfaces: [],
    title: "CPI Guard enabled",
    detail:
      "Protective: it blocks approve, close, set-authority, and similar actions when invoked through a cross-program call, reducing the blast radius of a malicious program.",
    remediation: "No action needed; this is a protective setting.",
    sourceRef: "skill/account-extensions.md",
  },
  "required-memo-on-transfer": {
    severity: "low",
    surfaces: [],
    title: "Requires a memo on incoming transfers",
    detail:
      "Incoming transfers must be preceded by a memo instruction or the transfer is rejected. Anything sending to this account must include one.",
    remediation: "Attach a memo instruction before any transfer to this account.",
    sourceRef: "skill/account-extensions.md",
  },
  "immutable-owner": {
    severity: "info",
    surfaces: [],
    title: "Immutable owner",
    detail: "The account owner cannot be changed. This is standard for associated token accounts.",
    remediation: "No action needed; this is standard for associated token accounts.",
    sourceRef: "skill/account-extensions.md",
  },
  "non-transferable-account": {
    severity: "info",
    surfaces: [],
    title: "Non-transferable account",
    detail: "It belongs to a non-transferable (soulbound) mint, so the balance can only be burned, never transferred out.",
    remediation: "Expect the balance to be burn-only; it cannot be transferred.",
    sourceRef: "skill/supply-controls.md",
  },
  "transfer-hook-account": {
    severity: "info",
    surfaces: [],
    title: "Transfer hook account flag",
    detail: "Carries the transferring flag a hook program reads during a transfer. It is transient state, set only mid-transfer.",
    remediation: "No action needed; it is transient transfer-time state.",
    sourceRef: "skill/transfer-hook.md",
  },
  "confidential-transfer-account": {
    severity: "info",
    surfaces: [],
    title: "Confidential transfer account state",
    detail: "Holds this account's confidential-transfer balances and keys. Confidential operations were re-enabled on mainnet on 2026-06-04 (issue token-2022#657); support across wallets and venues is still narrow.",
    remediation: "No action needed; confidential operations are enabled on mainnet again (since 2026-06-04), though tooling support is still narrow.",
    sourceRef: "skill/confidential-transfer.md",
  },
  "pausable-account": {
    severity: "info",
    surfaces: [],
    title: "Pausable account",
    detail: "It belongs to a pausable mint, so transfers are blocked while the mint is paused.",
    remediation: "Handle the paused state; transfers are blocked while the mint is paused.",
    sourceRef: "skill/supply-controls.md",
  },
};

/** Assess a decoded token account's state and account-level extensions. */
export function assessTokenAccount(input: TokenAccountInput): AccountAssessment {
  const findings: Finding[] = [];

  if (input.isFrozen) {
    findings.push({
      extension: "frozen",
      severity: "high",
      surfaces: [],
      title: "Account is frozen",
      detail: "The account is frozen and cannot send or receive until a freeze authority thaws it.",
      remediation: "The mint's freeze authority must thaw the account before it can transact.",
      sourceRef: "skill/supply-controls.md",
    });
  }

  if (input.withheldAmount !== null && input.withheldAmount !== "0") {
    findings.push({
      extension: "transfer-fee-amount",
      severity: "medium",
      surfaces: [],
      title: "Holds unharvested withheld transfer fees",
      detail: `The account holds ${input.withheldAmount} base units of withheld transfer fees, taken from amounts it received. It cannot be closed until they are harvested back to the mint.`,
      remediation: "Harvest the withheld fees back to the mint before closing this account.",
      sourceRef: "skill/transfer-fee.md",
    });
  }

  for (const extensionId of input.extensionIds) {
    const note = ACCOUNT_NOTES[extensionId];
    if (note !== undefined) {
      findings.push({ extension: extensionId, ...note });
    }
  }

  findings.sort((left, right) => severityRank(right.severity) - severityRank(left.severity));
  const severities = findings.map((finding) => finding.severity);
  return { findings, overallSeverity: maxSeverity(severities), score: scoreOf(severities) };
}
