# Evals: expected behavior on representative prompts

A self-check of what the skill should route to and what it must assert. Each case is a prompt, the file the router should land on, and the load-bearing facts the answer must contain. Run them by hand against the installed skill. The executable parts (the mint inspector, the batch triage, the remediation projection, and the compatibility checker) are covered by the 54 offline tests in `examples/mint-inspector`.

| # | Prompt | Routes to | Must assert |
|---|--------|-----------|-------------|
| 1 | "I want a token with a 1% fee on every transfer" | transfer-fee.md | Transfer Fee; the fee is taken from the received amount and withheld on the recipient; capped by a maximum fee |
| 2 | "Make transfers go through an allowlist" | transfer-hook.md, transfer-hook-security.md | Transfer Hook plus its ExtraAccountMetaList; fail closed; audit the hook before integrators trust it |
| 3 | "Can I use confidential transfers on mainnet today?" | confidential-transfer.md | No: disabled on mainnet since June 2025; re-enablement pending (patched runtime adopted around April 2026, gate not yet flipped); issue #657 open |
| 4 | "Combine Scaled UI Amount with Interest-Bearing" | compatibility-matrix.md | Rejected at init (InvalidExtensionCombination); pick one display model |
| 5 | "Is Confidential Transfer compatible with a Transfer Hook?" | compatibility-matrix.md | Yes, they coexist (PYUSD carries both); the hook receives u64::MAX on a confidential transfer, so amount-based hook logic applies only to regular transfers |
| 6 | "What extensions does mint <address> have?" | mint-inspector.md | Use the inspect_mint MCP tool or the CLI; it decodes the extensions and the integration posture |
| 7 | "Is this token safe for my exchange to list?" | mint-inspector.md, integration-compatibility.md | A permanent delegate, a pause authority, or a transfer hook are common listing blockers |
| 8 | "I need clawback for a regulated token" | supply-controls.md | Permanent Delegate; disclose it; a CEX listing concern; it does not reach confidentially held balances |
| 9 | "Migrate my SPL Token mint to Token-2022" | migration.md | No in-place upgrade; it means a new mint and a holder migration |
| 10 | "Soulbound token that also charges a transfer fee" | compatibility-matrix.md | Non-Transferable makes a transfer fee moot; pick one |
| 11 | "Vet this planned set: transfer-fee, permanent-delegate, pausable" | check_extension_compatibility tool | permanent-delegate and pausable are CEX blockers; transfer-fee is routing friction |
| 12 | "Default the tests to solana-bankrun" | testing.md | bankrun is deprecated; use LiteSVM |
| 13 | "What does the confidential transfer fee extension (code 16) on PYUSD mean?" | mint-inspector.md, confidential-transfer.md | It is required when a mint has both a transfer fee and confidential transfers; the inspector names it (the JS enum does not) |
| 14 | "This mint has a permanent delegate but the delegate is null. Still critical?" | mint-inspector.md, integration-compatibility.md | No: severity is conditional on authority liveness. A live permanent delegate is critical; a renounced (null) one is low and clears the CEX block |
| 15 | "Is PYUSD's transfer hook a listing blocker?" | mint-inspector.md | No: PYUSD's hook extension has no program set, so it is a medium latent caveat, not a hard blocker; an active hook (a program is set) is high and blocks |
| 16 | "Vet this whole listing set: mintA, mintB, mintC" | mint-inspector.md | Use the inspect_many MCP tool or pass several addresses to the CLI; it returns a per-mint verdict and an aggregate (worst verdict, counts by severity, how many carry a CEX listing blocker) |
| 17 | "This mint is CRITICAL from a live permanent delegate. What would lower the risk?" | mint-inspector.md | The renounce-to-remediate path: renouncing the permanent delegate drops the verdict and the 0-to-100 score; a mint that also carries confidential transfer cannot drop below high (it has no renounce path) |

These cases encode the corrections this skill makes over a flat reference: the confidential-transfer status and re-enablement timeline (3), the runtime-enforced exclusion (4), the corrected coexistence (5), the complete decode (13), conditional severity on authority liveness (14, 15), batch listing-set triage (16), the renounce-to-remediate path (17), and the executable tools (6, 11).
