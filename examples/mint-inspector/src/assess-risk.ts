/**
 * Turn a decoded extension set into integration findings, cross-extension
 * conflicts, and a wallet/DEX/CEX posture. Pure and deterministic: it operates on
 * the list of extension ids produced by decode-mint.
 *
 * Every rule cites the skill document that backs its claim, so the executable
 * assessment and the written guidance stay in sync.
 * Sources: skill/compatibility-matrix.md, skill/integration-compatibility.md,
 * skill/confidential-transfer.md, skill/supply-controls.md, skill/value-extensions.md,
 * skill/metadata-and-groups.md, skill/transfer-hook-security.md.
 */

export type Severity = "high" | "medium" | "low" | "info";
export type IntegrationSurface = "wallet" | "dex" | "cex";

export type Finding = {
  extension: string;
  severity: Severity;
  surfaces: IntegrationSurface[];
  title: string;
  detail: string;
  sourceRef: string;
};

export type Conflict = {
  extensions: string[];
  severity: Severity;
  title: string;
  detail: string;
  sourceRef: string;
};

export type Posture = {
  overallSeverity: Severity;
  cexBlockers: string[];
  dexFrictions: string[];
  walletCaveats: string[];
};

export type Assessment = {
  findings: Finding[];
  conflicts: Conflict[];
  posture: Posture;
};

type RiskRule = {
  severity: Severity;
  surfaces: IntegrationSurface[];
  title: string;
  detail: string;
  sourceRef: string;
  // A CEX deposit/withdrawal listing is the strictest surface. "blocker" means the
  // trust model commonly disqualifies a listing; "friction" means extra handling.
  cexImpact?: "blocker" | "friction";
};

// Keyed by the extension ids from extension-catalog.ts.
const RISK_RULES: Record<string, RiskRule> = {
  "transfer-hook": {
    severity: "high",
    surfaces: ["wallet", "dex", "cex"],
    cexImpact: "blocker",
    title: "Transfer hook runs on every transfer",
    detail:
      "Each hooked transfer invokes the hook program and needs its extra accounts resolved and simulated. Many DEXs and wallets need explicit support, and some venues reject hooks outright. If no hook program is set, the hook authority can set one at any time. Audit the hook program before trusting it.",
    sourceRef: "skill/integration-compatibility.md, skill/transfer-hook-security.md",
  },
  "confidential-transfer": {
    severity: "high",
    surfaces: ["wallet", "dex", "cex"],
    cexImpact: "blocker",
    title: "Confidential transfer extension present",
    detail:
      "Confidential transfers and the ZK ElGamal Proof Program have been disabled on mainnet since June 2025 (still disabled as of June 2026; re-enabled on testnet and devnet only, tracking issue token-2022#657), and tooling support is narrow. Do not assume confidential operations work on mainnet.",
    sourceRef: "skill/confidential-transfer.md",
  },
  "permanent-delegate": {
    severity: "high",
    surfaces: ["cex"],
    cexImpact: "blocker",
    title: "Permanent delegate can move or burn any balance",
    detail:
      "The permanent delegate holder can transfer or burn anyone's tokens. Custodians and exchanges treat this as a trust risk that can block a listing. Disclose it to holders and integrators.",
    sourceRef: "skill/compatibility-matrix.md, skill/integration-compatibility.md",
  },
  pausable: {
    severity: "medium",
    surfaces: ["dex", "cex"],
    cexImpact: "blocker",
    title: "Pausable: transfers can be halted",
    detail:
      "When paused, the program aborts all transfers, mints, and burns. Integrators must handle the paused state, and custodians treat the pause authority as a trust concern that often blocks a listing.",
    sourceRef: "skill/compatibility-matrix.md, skill/integration-compatibility.md",
  },
  "non-transferable": {
    severity: "medium",
    surfaces: ["dex", "cex"],
    cexImpact: "blocker",
    title: "Non-transferable (soulbound) token",
    detail:
      "The token cannot be transferred, so it cannot trade on a DEX or list on a CEX by design. Only mint and burn move supply.",
    sourceRef: "skill/supply-controls.md",
  },
  "transfer-fee": {
    severity: "medium",
    surfaces: ["dex", "cex"],
    cexImpact: "friction",
    title: "Transfer fee is withheld on receive",
    detail:
      "The fee is taken from the received amount and withheld on the recipient account, not charged to the sender separately. Escrows and routers must use the net received amount, and an account cannot be closed while it still holds withheld fees.",
    sourceRef: "skill/compatibility-matrix.md, skill/integration-compatibility.md",
  },
  "default-account-state": {
    severity: "medium",
    surfaces: ["wallet", "dex"],
    title: "New accounts may be frozen by default",
    detail:
      "Holders may need the freeze authority to thaw their account before they can transact. Vault and transfer logic can strand funds if it does not thaw accounts first.",
    sourceRef: "skill/compatibility-matrix.md",
  },
  "mint-close-authority": {
    severity: "low",
    surfaces: ["cex"],
    title: "Mint can be closed at zero supply",
    detail:
      "The close authority can reclaim the mint account once supply is zero. Integrators that track the mint should handle its possible closure.",
    sourceRef: "skill/supply-controls.md",
  },
  "interest-bearing": {
    severity: "low",
    surfaces: ["wallet", "dex"],
    title: "Interest-bearing: UI amount drifts from raw amount",
    detail:
      "The displayed UI amount differs from the raw amount and changes over time. Integrators must convert with the amount-to-UI helper. The raw supply does not change.",
    sourceRef: "skill/value-extensions.md",
  },
  "scaled-ui-amount": {
    severity: "low",
    surfaces: ["wallet", "dex"],
    title: "Scaled UI amount: display is multiplied",
    detail:
      "The UI amount is the raw amount times a multiplier the authority can update. Integrators must use the UI-amount conversion. The raw supply does not change.",
    sourceRef: "skill/value-extensions.md",
  },
  "metadata-pointer": {
    severity: "info",
    surfaces: [],
    title: "Metadata pointer set",
    detail: "Points to where the token metadata lives. Widely supported by wallets and explorers.",
    sourceRef: "skill/metadata-and-groups.md",
  },
  "token-metadata": {
    severity: "info",
    surfaces: [],
    title: "On-chain token metadata",
    detail: "Metadata is stored on the mint itself. Widely supported by wallets and explorers.",
    sourceRef: "skill/metadata-and-groups.md",
  },
  "group-pointer": {
    severity: "info",
    surfaces: [],
    title: "Group pointer set",
    detail: "Points to a token group account. Tooling support for groups varies.",
    sourceRef: "skill/metadata-and-groups.md",
  },
  "token-group": {
    severity: "info",
    surfaces: [],
    title: "Token group configured",
    detail: "Declares this mint as a group with a member size. Tooling support for groups varies.",
    sourceRef: "skill/metadata-and-groups.md",
  },
  "group-member-pointer": {
    severity: "info",
    surfaces: [],
    title: "Group member pointer set",
    detail: "Points to a group member account. Tooling support for groups varies.",
    sourceRef: "skill/metadata-and-groups.md",
  },
  "token-group-member": {
    severity: "info",
    surfaces: [],
    title: "Token group member configured",
    detail: "Declares this mint as a member of a group. Tooling support for groups varies.",
    sourceRef: "skill/metadata-and-groups.md",
  },
  "confidential-transfer-fee": {
    severity: "info",
    surfaces: [],
    title: "Confidential transfer fee configured",
    detail:
      "Holds the fee config for confidential transfers. It only takes effect when confidential transfers run, which they do not on mainnet (disabled since June 2025, tracking issue token-2022#657). It appears alongside the confidential transfer extension on mints like PYUSD.",
    sourceRef: "skill/confidential-transfer.md",
  },
  "confidential-mint-burn": {
    severity: "info",
    surfaces: [],
    title: "Confidential mint and burn configured",
    detail:
      "Supports minting and burning against confidential balances. Like other confidential operations it depends on the ZK ElGamal Proof Program, which is disabled on mainnet (tracking issue token-2022#657).",
    sourceRef: "skill/confidential-transfer.md",
  },
  "permissioned-burn": {
    severity: "low",
    surfaces: ["cex"],
    title: "Permissioned burn restricts who can burn",
    detail:
      "A newer Token-2022 extension that gates burning behind a designated authority rather than the token holder. Confirm who holds that authority and that your wallet, explorer, and custody tooling recognize the extension before relying on it.",
    sourceRef: "skill/supply-controls.md",
  },
  unrecognized: {
    severity: "low",
    surfaces: ["wallet", "dex"],
    title: "Unrecognized extension present",
    detail:
      "An extension code that this build does not map was found. Verify wallet and explorer support and confirm your @solana/spl-token version is current before relying on it.",
    sourceRef: "skill/compatibility-matrix.md",
  },
};

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
  {
    // Runtime-enforced: check_for_invalid_mint_extension_combinations rejects this
    // pair because both rewrite the displayed amount.
    // Source: interface/src/extension/mod.rs (check_for_invalid_mint_extension_combinations).
    pair: ["scaled-ui-amount", "interest-bearing"],
    severity: "high",
    title: "Scaled UI Amount with Interest-Bearing is rejected at init",
    detail:
      "Both extensions rewrite the displayed amount, so Token-2022 rejects a mint that declares both with InvalidExtensionCombination. Choose one display model: a fixed multiplier (Scaled UI Amount) or an accruing rate (Interest-Bearing).",
    sourceRef: "skill/compatibility-matrix.md",
  },
];

const SEVERITY_RANK: Record<Severity, number> = { info: 0, low: 1, medium: 2, high: 3 };

/** Numeric rank for a severity, so callers can sort and take the maximum. */
export function severityRank(severity: Severity): number {
  return SEVERITY_RANK[severity];
}

/** Assess a set of extension ids into findings, conflicts, and an overall posture. */
export function assessExtensions(extensionIds: string[]): Assessment {
  const present = new Set(extensionIds);

  const findings: Finding[] = [];
  for (const extensionId of extensionIds) {
    const rule = RISK_RULES[extensionId];
    if (rule === undefined) {
      continue;
    }
    findings.push({
      extension: extensionId,
      severity: rule.severity,
      surfaces: rule.surfaces,
      title: rule.title,
      detail: rule.detail,
      sourceRef: rule.sourceRef,
    });
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

  return { findings, conflicts, posture: computePosture(extensionIds, findings, conflicts) };
}

function computePosture(extensionIds: string[], findings: Finding[], conflicts: Conflict[]): Posture {
  const cexBlockers = dedupe(extensionIds.filter((id) => RISK_RULES[id]?.cexImpact === "blocker"));
  const dexFrictions = dedupe(findings.filter((finding) => finding.surfaces.includes("dex")).map((finding) => finding.extension));
  const walletCaveats = dedupe(findings.filter((finding) => finding.surfaces.includes("wallet")).map((finding) => finding.extension));

  const severities: Severity[] = [
    ...findings.map((finding) => finding.severity),
    ...conflicts.map((conflict) => conflict.severity),
  ];
  const overallSeverity = severities.reduce<Severity>(
    (max, severity) => (severityRank(severity) > severityRank(max) ? severity : max),
    "info",
  );

  return { overallSeverity, cexBlockers, dexFrictions, walletCaveats };
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

export type AccountAssessment = {
  findings: Finding[];
  overallSeverity: Severity;
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
    sourceRef: "skill/account-extensions.md",
  },
  "required-memo-on-transfer": {
    severity: "low",
    surfaces: [],
    title: "Requires a memo on incoming transfers",
    detail:
      "Incoming transfers must be preceded by a memo instruction or the transfer is rejected. Anything sending to this account must include one.",
    sourceRef: "skill/account-extensions.md",
  },
  "immutable-owner": {
    severity: "info",
    surfaces: [],
    title: "Immutable owner",
    detail: "The account owner cannot be changed. This is standard for associated token accounts.",
    sourceRef: "skill/account-extensions.md",
  },
  "non-transferable-account": {
    severity: "info",
    surfaces: [],
    title: "Non-transferable account",
    detail: "It belongs to a non-transferable (soulbound) mint, so the balance can only be burned, never transferred out.",
    sourceRef: "skill/supply-controls.md",
  },
  "transfer-hook-account": {
    severity: "info",
    surfaces: [],
    title: "Transfer hook account flag",
    detail: "Carries the transferring flag a hook program reads during a transfer. It is transient state, set only mid-transfer.",
    sourceRef: "skill/transfer-hook.md",
  },
  "pausable-account": {
    severity: "info",
    surfaces: [],
    title: "Pausable account",
    detail: "It belongs to a pausable mint, so transfers are blocked while the mint is paused.",
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
  const overallSeverity = findings.reduce<Severity>(
    (max, finding) => (severityRank(finding.severity) > severityRank(max) ? finding.severity : max),
    "info",
  );
  return { findings, overallSeverity };
}
