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

The inspector names every extension in the canonical Token-2022 interface (codes 0 to 28, with PermissionedBurn=28 the newest defined), including codes the published `@solana/spl-token` enum does not yet name (for example the confidential transfer fee, code 16, which PYUSD carries, plus confidential mint and burn=24, permissioned burn=28, and the account-level confidential transfer account=5). A code that no version maps is still reported as unrecognized with its numeric value, not dropped, so a brand-new extension shows up rather than disappearing.

## CLI

```bash
cd examples/mint-inspector
npm install
npm run inspect -- <MINT_ADDRESS> [--rpc <URL>]   # text report
npm run inspect -- <MINT_ADDRESS> --json          # machine-readable
```

The default RPC is Solana mainnet-beta. Pass `--rpc` for another cluster or a private endpoint. Exit code is 0 on success, 1 on an inspection error (bad address, RPC failure, account not found, not a mint), 2 on a usage error.

## MCP server

The same logic is exposed as an MCP tool named `inspect_mint`, so an agent in the kit can inspect a mint without writing code.

```bash
cd examples/mint-inspector
npm install
npm run mcp        # serves inspect_mint over stdio
```

Register it in an MCP client by pointing the client at that command. The tool takes `{ mintAddress: string, rpcUrl?: string }` and returns the text report plus the JSON inspection.

## How it works
The decoder uses the typed `@solana/spl-token` getters, never raw byte offsets. The risk rules are a direct, executable form of [compatibility-matrix.md](compatibility-matrix.md) and [integration-compatibility.md](integration-compatibility.md): every rule cites the document it came from, so the tool and the written guidance stay in sync. The core is pure and tested offline with LiteSVM-built mints; the only IO is a single `getAccountInfo` call.
