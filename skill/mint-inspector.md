# Mint inspector: decode a live mint and assess integration risk

A read-only tool that takes a mint or token account address, decodes its Token-2022 extensions from on-chain data, and reports the integration risk. For a mint it reports the wallet, DEX, and CEX risks; for a token account it reports the balance, frozen state, withheld fees, and account extensions (immutable owner, CPI guard, required memo). It ships as a CLI and an MCP server in `examples/mint-inspector`. Use it for due diligence on a token you did not mint: before integrating it, routing it, or listing it.

It never signs or sends a transaction. It reads one account.

## When to reach for it
- "What extensions does this mint have, and what do they imply for integration?"
- "Is this token safe to list or route?" (the strict surface is a centralized exchange).
- Confirming your own mint after launch carries exactly the extension set you intended.

## What it reports
- Mint basics: program (Token-2022 or classic SPL), decimals, raw supply, mint and freeze authorities.
- Extensions: each present extension with key fields. Transfer fee shows basis points and the max fee. Transfer hook shows the hook program id (or `none` when the extension is present but no program is set). Permanent delegate shows the delegate. Default account state shows frozen or initialized. Token metadata shows name, symbol, and uri.
- Findings: one per extension and per base authority (mint, freeze), ranked by severity (critical, high, medium, low, info). Severity is conditional on authority liveness: a fund-loss-grade extension scores high only while its controlling authority is live, so a renounced permanent delegate or a locked fee rate scores far lower. Each finding names the affected surfaces (wallet, DEX, CEX), a concrete `fix:`, and the skill document that backs the claim.
- Conflicts: cross-extension problems from [compatibility-matrix.md](compatibility-matrix.md), for example Confidential Transfer with Transfer Hook.
- Posture: a verdict tier and a 0-to-100 risk score, plus the CEX listing blockers, DEX routing frictions, and wallet caveats, derived from the findings. A renounced authority downgrades its finding and clears the CEX block.
- Remediation: a renounce-to-remediate path. For each live authority an issuer could renounce (a permanent delegate, a fee-config authority, a pause authority, the mint or freeze authority), the report shows the verdict the mint would then have, ordered by the largest risk reduction first, plus the result of renouncing all of them. The score becomes a path, not just a label (CRITICAL today to MEDIUM once the permanent delegate is renounced).

The inspector names every extension in the canonical Token-2022 interface (codes 0 to 28, with PermissionedBurn=28 the newest defined), including codes the published `@solana/spl-token` enum does not yet name (for example the confidential transfer fee, code 16, which PYUSD carries, plus confidential mint and burn=24, permissioned burn=28, and the account-level confidential transfer account=5). A code that no version maps is still reported as unrecognized with its numeric value, not dropped, so a brand-new extension shows up rather than disappearing.

## CLI

```bash
cd examples/mint-inspector
npm install
npm run inspect -- <MINT_ADDRESS> [--rpc <URL>]            # text report
npm run inspect -- <MINT_ADDRESS> --json                   # machine-readable
npm run inspect -- <ADDRESS_1> <ADDRESS_2> ... [--json]    # batch triage of many addresses
npm run inspect -- --scaffold <ID_1>,<ID_2>,... [--decimals <N>]   # generate mint code (offline)
npm run inspect -- --hook-codegen <MINT> --hook <PROGRAM> [--decimals <N>]   # transfer-hook client (offline)
```

The default RPC is Solana mainnet-beta. Pass `--rpc` for another cluster or a private endpoint. One address prints the full report; more than one prints a batch summary (worst verdict, counts by severity, how many carry a CEX blocker) with a per-address line. Exit code is 0 on success, 1 on an inspection error (bad address, RPC failure, account not found, not a mint), 2 on a usage error.

## Scored evals

A runnable, scored eval suite turns the executable rows of EVALS.md into checks against the real risk engine:

```bash
cd examples/mint-inspector
npm run evals      # prints a PASS/FAIL table and an accuracy, exits non-zero on any failure
```

`evals.json` holds 21 cases (planned extension sets with authority liveness, and captured mainnet mints, 11 of which are real on-chain) checked for severity, the 0-to-100 score, CEX blockers, conflicts, decoded extensions, and the remediation path. A vitest gate runs the same suite under `make verify`, so a verdict regression fails the build. Latest run: 21 of 21 (100%), 11 of them real mainnet mints.

## MCP server

The same logic is exposed over MCP as five read-only tools (each with declared read-only annotations and a structured, agent-consumable verdict), so an agent in the kit can work without writing code.

```bash
cd examples/mint-inspector
npm install
npm run mcp        # serves the five tools over stdio
```

Register them in an MCP client by pointing the client at that command.

- `inspect_mint` takes `{ mintAddress: string, rpcUrl?: string }` and returns the text report (with the renounce-to-remediate path) plus the JSON inspection and a structured verdict.
- `inspect_many` takes `{ mintAddresses: string[], rpcUrl?: string }` (up to 50) and returns a per-address verdict plus an aggregate roll-up, for triaging a listing set in one call.
- `check_extension_compatibility` takes `{ extensions: string[] }` and returns the conflicts and posture of a planned set before any mint exists.
- `scaffold_mint` takes `{ extensions: string[], decimals?: number }` and returns an init plan plus mint-creation code with the order and sizing correct, refusing any set the runtime would reject at init.
- `generate_hook_transfer` takes `{ mint: string, hookProgramId: string, decimals?: number }` and returns a correct transfer client for a hooked mint, with the extra accounts resolved against the Execute account set, plus a static classification of the hook's extra-account model.

## How it works
The decoder uses the typed `@solana/spl-token` getters, never raw byte offsets. The risk rules are a direct, executable form of [compatibility-matrix.md](compatibility-matrix.md) and [integration-compatibility.md](integration-compatibility.md): every rule cites the document it came from, so the tool and the written guidance stay in sync. Severity also weighs a transfer fee by size (a near-100% fee is a sell-blocking honeypot even when the rate is locked) and resolves the active versus a scheduled fee under the two-epoch rule. The same engine backs `scaffold_mint`, which vets a set and emits ordered, correctly-sized mint code. The decode and risk core is pure and tested offline with LiteSVM-built mints. The base inspection is one `getAccountInfo`; when a mint carries an **active transfer hook**, the inspector takes a second hop, reading the hook program and its ProgramData header to report whether the hook's bytecode is immutable or upgradeable. An upgradeable hook can be swapped for a sell-blocker after an audit, the single largest latent risk a mint decode alone is blind to; the verdict names the upgrade authority rather than declaring the hook safe. All IO stays in `src/fetch-account.ts`, offline and key-free.

## Limitations

The inspector reads a mint's on-chain configuration, not its runtime behavior, so be explicit about what it does not do:

- **It reports hook mutability, not hook logic.** The second hop reads whether the hook program is immutable or upgradeable (and by which authority), but it does not analyze the hook's bytecode; a malicious or later-upgraded hook can still implement a sell-blocker in code no decode reveals. Use `/audit-transfer-hook` and [transfer-hook-security.md](transfer-hook-security.md) for the logic review.
- **It is a point-in-time read.** Authorities can change after inspection: where a higher authority exists, a currently-null authority can be re-granted. Re-inspect before relying on a verdict.
- **It does not measure market or off-chain risk:** liquidity, holder concentration, team or social trust, oracle manipulation, or rugs driven by a privileged off-chain system.
- **Confidential balances are opaque by design.** The inspector flags the extension and the compliance constraint but cannot see confidential amounts.
- **It is offline and deterministic on purpose**: the base mint read, plus the hook program and its ProgramData header when a hook is active (the second hop). It does not simulate a transfer, query an indexer, or scan transaction history. That keeps it fast, reproducible, and key-free, at the cost of dynamic detection.
