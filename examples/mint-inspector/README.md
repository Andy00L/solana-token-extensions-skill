# mint-inspector

A read-only tool that decodes a Solana mint or token account from on-chain data: its Token-2022 extensions and, for a mint, the wallet, DEX, and CEX integration risks. For a token account it reports the balance, frozen state, withheld fees, and account extensions. Severity is **conditional on authority liveness**: a fund-loss-grade extension scores high only while its controlling authority is live (a renounced permanent delegate, or a locked fee rate, is far lower risk), mirroring how integrators such as Jupiter triage a token. It emits a 0-to-100 risk score, a verdict tier, and a concrete `fix:` per finding. It ships as a CLI and an MCP server over the same tested core. It never signs or sends a transaction: it reads one account.

![Inspecting the PayPal USD (PYUSD) mint](demo.gif)

See [DEMO.md](DEMO.md) for this output as text, plus USDC and a planned extension set.

## Install

```bash
npm install
```

## CLI

```bash
npm run inspect -- <MINT_ADDRESS> [--rpc <URL>]   # text report
npm run inspect -- <MINT_ADDRESS> --json          # machine-readable JSON
npm run inspect -- --help
```

The default RPC is Solana mainnet-beta. Exit code is 0 on success, 1 on an inspection error (invalid address, RPC failure, account not found, not a mint), and 2 on a usage error.

Example, against the PayPal USD (PYUSD) Token-2022 mint:

```
$ npm run inspect -- 2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo

Token-2022 mint inspection
  Address:          2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo
  Program:          token-2022 (TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb)
  Decimals:         6
  ...
Extensions (8):
  - Mint Close Authority, Permanent Delegate, Transfer Fee, Confidential Transfer,
    Confidential Transfer Fee, Transfer Hook (programId: none), Metadata Pointer, Token Metadata

Verdict: CRITICAL (risk score 100/100)
Integration findings (10):
  [CRITICAL] Permanent delegate can seize or burn any balance (wallet, dex, cex)
      fix: Renounce the permanent delegate unless seizure is an intended, disclosed feature.
  [HIGH]     Confidential transfer extension present (disabled on mainnet, #657)
  [MEDIUM]   Transfer fee is withheld on receive (live fee authority can raise the rate)
  [MEDIUM]   Transfer hook present but no program set (latent caveat, not an active block)
  [MEDIUM]   Freeze authority is live (accounts can be frozen)
  [LOW]      Mint close authority; [LOW] Mint authority is live; [INFO] x3
Posture:
  CEX listing blockers:  permanent-delegate, confidential-transfer
```

(Output trimmed; see [DEMO.md](DEMO.md) for the full report.) PYUSD scores **CRITICAL** because its permanent delegate is live. Its transfer-hook extension has no program set, so it is a medium latent caveat and **not** a hard CEX blocker (an active hook, like the WNS NFT fixture, is). The inspector names all eight extensions, including the confidential transfer fee (code 16) the published `@solana/spl-token` enum does not map. Renounce the permanent delegate and the verdict drops, exactly the live-vs-renounced distinction the engine makes visible.

## MCP server

The same core is exposed over MCP as two read-only tools, so an agent can work without writing code.

```bash
npm run mcp        # serves the tools over stdio
```

- `inspect_mint` takes `{ mintAddress: string, rpcUrl?: string }` and returns the text report plus the JSON inspection for a live mint.
- `check_extension_compatibility` takes `{ extensions: string[] }` (extension ids such as `transfer-hook`, `permanent-delegate`, `scaled-ui-amount`) and returns the conflicts and integration posture of a planned set, before any mint exists.

Register them by pointing an MCP client at that command.

## Tests

```bash
npm test           # tsc --noEmit, then the suite (one file per process, retries only on a LiteSVM native crash)
```

**43 tests, offline and deterministic.** The risk engine and the compatibility checker are tested as pure functions, including the conditional-severity model (a renounced permanent delegate downgrades to low and clears the CEX block; a no-program hook is medium, an active hook is high) and the 0-to-100 score; the decoder is tested against Token-2022 mints built in LiteSVM, against five captured mainnet mints (PYUSD, USDC, BERN, sUSD, and a WNS hooked NFT) decoded from committed account bytes, and against a built token account (withheld fees, immutable owner); the MCP handler is tested with an injected fetcher. The only IO in the tool is a single `getAccountInfo` call, isolated in `src/fetch-account.ts` and injected in tests.

## Dependency advisories

`npm audit` reports advisories that are all transitive in the pinned January 2026 stack, and they match the other examples in this repo:

- `bigint-buffer` and `uuid`: pulled in by `@solana/web3.js` 1.x and `@solana/spl-token` 0.4.x. The advised fix downgrades `@solana/spl-token` to 0.1.8, which removes Token-2022 entirely, so it is not applied.
- `esbuild` and `vitest`/`@vitest/mocker`: pulled in by the test runner. The `@vitest/mocker` advisory only applies when the Vitest UI server is running; the suite runs headless with `vitest run`, never `--ui`. These do not ship with the tool.

None are reachable in the read-only inspection path (one `getAccountInfo` call, then typed decoding). The pinned stack is kept on purpose; revisit when the Solana client line and the runner have non-breaking upgrades.

## Layout

```
src/
  extension-catalog.ts   ExtensionType to id and label, keyed off the spl-token enum plus interface-only codes
  decode-mint.ts         decode a mint account into a serializable structure (errors as values)
  assess-risk.ts         executable form of the skill's compatibility and integration rules
  inspect.ts             decode + assess, plus the shared text report formatter
  check-compatibility.ts transport-free check_extension_compatibility handler
  fetch-account.ts       the only IO: one getAccountInfo call
  cli.ts                 CLI entry
  mcp-tool.ts            transport-free inspect_mint handler (testable with an injected fetcher)
  mcp-server.ts          thin MCP stdio server exposing both tools
tests/                   pure risk and compatibility tests, LiteSVM decode tests, captured-mint decodes, MCP handler tests
```
