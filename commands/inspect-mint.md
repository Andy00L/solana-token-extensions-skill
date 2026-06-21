---
description: "Inspect a Token-2022 mint by address: decode its extensions and report wallet, DEX, and CEX integration risks."
---

# /inspect-mint

Decode a live mint and assess its integration risk. Read only: never sign or send.

Input: a base58 mint address, and an optional RPC URL, in `$ARGUMENTS`.

Steps:
1. If the `examples/mint-inspector` tool is present in the repo, run it and use its output:
   `cd examples/mint-inspector && npm install && npm run inspect -- <MINT_ADDRESS> [--rpc <URL>]`
   It decodes the extension set and prints findings, conflicts, and a CEX, DEX, and wallet posture. Add `--json` for machine output.
2. Otherwise, fetch the mint account, list its extensions with the typed `@solana/spl-token` getters, and assess each against [compatibility-matrix.md](../skill/compatibility-matrix.md) and [integration-compatibility.md](../skill/integration-compatibility.md).
3. Report: the extension set with key fields (fee basis points, hook program id, permanent delegate, default state), any conflicts, and which surfaces (wallet, DEX, CEX) are affected and why.
4. Call out the high-severity items first: transfer hook, permanent delegate, confidential transfer, pausable. State the CEX listing blockers explicitly.

See [mint-inspector.md](../skill/mint-inspector.md) for the tool, its output format, and the MCP server.
