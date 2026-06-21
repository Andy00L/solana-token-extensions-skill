# mint-inspector

A read-only tool that decodes a Solana mint's Token-2022 extensions from on-chain data and reports the wallet, DEX, and CEX integration risks. It ships as a CLI and an MCP server over the same tested core. It never signs or sends a transaction: it reads one account.

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
  - Permanent Delegate [permanent-delegate]
  - Confidential Transfer [confidential-transfer]
  - Unrecognized extension (code 16) [unrecognized]
  - Transfer Hook [transfer-hook]
      programId: none
  - Token Metadata [token-metadata]
      name: PayPal USD
  ...
Posture:
  CEX listing blockers:  permanent-delegate, confidential-transfer, transfer-hook
```

(Output trimmed. The unrecognized code 16 is the confidential transfer fee sub-extension, which the pinned `@solana/spl-token` enum does not name; the inspector reports it rather than dropping it.)

## MCP server

The same logic is exposed as an MCP tool named `inspect_mint`, so an agent can inspect a mint without writing code.

```bash
npm run mcp        # serves inspect_mint over stdio
```

The tool takes `{ mintAddress: string, rpcUrl?: string }` and returns the text report plus the JSON inspection. Register it by pointing an MCP client at that command.

## Tests

```bash
npm test           # tsc --noEmit, then the suite (retries only on a LiteSVM native crash)
```

The suite is offline and deterministic. The risk engine is tested as pure functions; the decoder and the MCP handler are tested against real Token-2022 mints built in LiteSVM (no devnet, no network). The only IO in the tool is a single `getAccountInfo` call, isolated in `src/fetch-account.ts` and injected into the handler in tests.

## Dependency advisories

`npm audit` reports advisories that are all transitive in the pinned January 2026 stack, and they match the other examples in this repo:

- `bigint-buffer` and `uuid`: pulled in by `@solana/web3.js` 1.x and `@solana/spl-token` 0.4.x. The advised fix downgrades `@solana/spl-token` to 0.1.8, which removes Token-2022 entirely, so it is not applied.
- `esbuild` and `vitest`/`@vitest/mocker`: pulled in by the test runner. The `@vitest/mocker` advisory only applies when the Vitest UI server is running; the suite runs headless with `vitest run`, never `--ui`. These do not ship with the tool.

None are reachable in the read-only inspection path (one `getAccountInfo` call, then typed decoding). The pinned stack is kept on purpose; revisit when the Solana client line and the runner have non-breaking upgrades.

## Layout

```
src/
  extension-catalog.ts   ExtensionType to id and label, keyed off the spl-token enum
  decode-mint.ts         decode a mint account into a serializable structure (errors as values)
  assess-risk.ts         executable form of the skill's compatibility and integration rules
  inspect.ts             decode + assess, plus the text report formatter
  fetch-account.ts       the only IO: one getAccountInfo call
  cli.ts                 CLI entry
  mcp-tool.ts            transport-free inspect_mint handler (testable with an injected fetcher)
  mcp-server.ts          thin MCP stdio server over mcp-tool.ts
tests/                   pure risk tests, LiteSVM decode tests, MCP handler tests
```
