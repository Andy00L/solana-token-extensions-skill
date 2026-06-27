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
export type AssessedExtension = {
  id: string;
  authorityRenounced?: boolean;
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
// live authority (highest-leverage first), and the posture if all were renounced.
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
    severity: "high",
    surfaces: ["wallet", "dex", "cex"],
    cexImpact: "blocker",
    title: "Confidential transfer extension present",
    detail:
      "Confidential transfers and the ZK ElGamal Proof Program have been disabled on mainnet-beta since June 2025 (issue token-2022#657 open). A patched, re-audited runtime reached supermajority stake adoption around April 2026, so re-enablement is pending, not permanent. Tooling support is narrow even where enabled. Do not assume confidential operations work on mainnet today.",
    remediation:
      "Do not rely on confidential operations on mainnet today; track issue token-2022#657 for re-enablement and re-test wallet and DEX support when it lands.",
    sourceRef: "skill/confidential-transfer.md",
  },
  pausable: {
    severity: "medium",
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
      "Holds the fee config for confidential transfers. It only takes effect when confidential transfers run, which they do not on mainnet today (disabled since June 2025, issue token-2022#657). It appears alongside the confidential transfer extension on mints like PYUSD.",
    remediation: "No action needed today; it activates only if confidential transfers are re-enabled on mainnet.",
    sourceRef: "skill/confidential-transfer.md",
  },
  "confidential-mint-burn": {
    severity: "info",
    surfaces: [],
    title: "Confidential mint and burn configured",
    detail:
      "Supports minting and burning against confidential balances. Like other confidential operations it depends on the ZK ElGamal Proof Program, which is disabled on mainnet today (issue token-2022#657).",
    remediation: "No action needed today; it activates only if confidential operations are re-enabled on mainnet.",
    sourceRef: "skill/confidential-transfer.md",
  },
  "permissioned-burn": {
    severity: "low",
    surfaces: ["cex"],
    title: "Permissioned burn restricts who can burn",
    detail:
      "A newer Token-2022 extension (interface code 28, the highest defined) that gates burning behind a designated authority rather than the token holder. Confirm who holds that authority and that your wallet, explorer, and custody tooling recognize the extension before relying on it.",
    remediation: "Confirm who holds the burn authority and that your tooling recognizes the extension before listing or custody.",
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
): Remediation {
  const current = assessExtensions(extensions, mintAuthorities).posture;
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
    const posture = assessExtensions(projected, mintAuthorities).posture;
    steps.push({ target: extension.id, afterSeverity: posture.overallSeverity, afterScore: posture.score });
  }

  if (mintAuthorities?.mintAuthorityLive === true) {
    const posture = assessExtensions(extensions, { ...mintAuthorities, mintAuthorityLive: false }).posture;
    steps.push({ target: "mint-authority", afterSeverity: posture.overallSeverity, afterScore: posture.score });
  }
  if (mintAuthorities?.freezeAuthorityLive === true) {
    const posture = assessExtensions(extensions, { ...mintAuthorities, freezeAuthorityLive: false }).posture;
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
    const posture = assessExtensions(projectedExtensions, projectedAuthorities).posture;
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

function computePosture(findings: Finding[], conflicts: Conflict[]): Posture {
  // A finding remains a CEX blocker only if its rule marks it a blocker and its
  // effective severity is still medium or higher (a renounced authority that
  // downgrades it to low or info no longer blocks).
  const cexBlockers = dedupe(
    findings
      .filter((finding) => {
        const rule = RISK_RULES[finding.extension];
        // A blocker counts only at its live (base) severity. A renounced authority
        // downgrades the finding, so the dormant power no longer blocks a listing.
        return rule?.cexImpact === "blocker" && finding.severity === rule.severity;
      })
      .map((finding) => finding.extension),
  );
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
    detail: "Holds this account's confidential-transfer balances and keys. Confidential operations are disabled on mainnet today (issue token-2022#657), so this state is dormant there.",
    remediation: "No action needed today; confidential operations are disabled on mainnet.",
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
