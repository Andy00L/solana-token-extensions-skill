# mint-inspector

A read-only tool that decodes a Solana mint or token account from on-chain data: its Token-2022 extensions and, for a mint, the wallet, DEX, and CEX integration risks. For a token account it reports the balance, frozen state, withheld fees, and account extensions. Severity is **conditional on authority liveness**: a fund-loss-grade extension scores high only while its controlling authority is live (a renounced permanent delegate, or a locked fee rate, is far lower risk), mirroring how integrators such as Jupiter triage a token. It emits a 0-to-100 risk score, a verdict tier, a concrete `fix:` per finding, and a renounce-to-remediate path (the verdict each live authority an issuer could renounce would produce). It ships as a CLI and an MCP server (five read-only tools, with declared read-only annotations and a structured agent-consumable verdict) over the same tested core, and the CLI takes more than one address to triage a whole set at once, or `--scaffold` / `--hook-codegen` to generate mint or transfer code. It never signs or sends a transaction: it reads one account.

![Inspecting the PayPal USD (PYUSD) mint](demo.gif)

See [DEMO.md](DEMO.md) for this output as text, plus USDC and a planned extension set.

## Install

```bash
npm install
```

## CLI

```bash
npm run inspect -- <MINT_ADDRESS> [--rpc <URL>]   # text report (with a renounce-to-remediate path)
npm run inspect -- <MINT_ADDRESS> --json          # machine-readable JSON
npm run inspect -- <ADDR_1> <ADDR_2> ...          # batch triage of many addresses
npm run inspect -- --scaffold <ID_1>,<ID_2>,...   # generate a mint scaffold (offline)
npm run inspect -- --hook-codegen <MINT> --hook <PROGRAM>   # transfer-hook transfer client (offline)
npm run inspect -- --help
```

The default RPC is Solana mainnet-beta. One address prints the full report; more than one prints a batch summary. Exit code is 0 on success, 1 on an inspection error (invalid address, RPC failure, account not found, not a mint), and 2 on a usage error.

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
  [MEDIUM]   Transfer fee is withheld on receive (active 0 bps; a near-100% fee would be critical)
  [MEDIUM]   Confidential transfer extension present (re-enabled on mainnet 2026-06-04; narrow support)
  [MEDIUM]   Transfer hook present but no program set (latent caveat, not an active block)
  [MEDIUM]   Freeze authority is live (accounts can be frozen)
  [LOW]      Mint close authority; [LOW] Mint authority is live; [INFO] x3
Posture:
  CEX listing blockers:  permanent-delegate

Remediation path (renounce a live authority to lower risk):
  current: CRITICAL (risk score 100/100)
  renounce permanent-delegate -> MEDIUM (80/100)
  ...
  renounce all of the above -> MEDIUM (45/100)
```

(Output trimmed; see [DEMO.md](DEMO.md) for the full report.) PYUSD scores **CRITICAL** because its permanent delegate is live. Its transfer-hook extension has no program set, so it is a medium latent caveat and **not** a hard CEX blocker (an active hook, like the WNS NFT fixture, is). The inspector names all eight extensions, including the confidential transfer fee (code 16) the published `@solana/spl-token` enum does not map. The **remediation path** shows that renouncing the live permanent delegate clears the only hard CEX blocker and drops the tier (CRITICAL to MEDIUM); the re-enabled confidential transfer and the latent hook remain medium integration constraints, so the mint floors at MEDIUM (45/100), not info.

### Batch triage

Pass more than one address to triage a whole set at once: a per-mint verdict (worst first) plus an aggregate. Built for "is my exchange's listing set safe."

```
$ npm run inspect -- <PYUSD> <USDC> <BERN> <sUSD> <BNDRG>

Token-2022 batch inspection
  Addresses:         5
  Inspected:         5
  Failed:            0
  Worst verdict:     CRITICAL
  With CEX blockers: 2
  By severity:       critical 1, high 1, medium 2, low 0, info 1

Per address (worst first):
  [CRITICAL 100/100] 2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo (mint; CEX blockers: permanent-delegate)
  [HIGH 60/100]      8eDYWjDKmCR5B3UJm95gaG8zCdT5anWakTZG1PyWpBm9 (mint; CEX blockers: transfer-hook)
  [MEDIUM 25/100]    susdabGDNbhrnCa6ncrYo81u4s9GM8ecK2UwMyZiq4X (mint; no CEX blockers)
  [MEDIUM 15/100]    CKfatsPMUf8SkiURsDXs7eK6GWb4Jsd6UDbs7twMCWxo (mint; no CEX blockers)
  [INFO 0/100]       EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v (mint; no CEX blockers)
```

Batch triage is a fast first pass (one `getMultipleAccounts`, no per-mint second hop). Run a single inspect on a flagged mint for the second-hop hook-program analysis: it follows BNDRG's active WNS hook and raises it from HIGH 60/100 to HIGH 95/100 once the upgradeable program is read.

## MCP server

The same core is exposed over MCP as five read-only tools (each with declared read-only annotations and a structured, agent-consumable verdict via `structuredContent`), so an agent can work without writing code.

```bash
npm run mcp        # serves the tools over stdio
```

- `inspect_mint` takes `{ mintAddress: string, rpcUrl?: string }` and returns the text report (including the renounce-to-remediate path), the JSON inspection, and a structured verdict for a live mint. When the mint has an active transfer hook, it follows the hook to its program and reports whether the hook is immutable or upgradeable (an upgradeable hook can be swapped for a sell-blocker after an audit).
- `inspect_many` takes `{ mintAddresses: string[], rpcUrl?: string }` (up to 50) and returns a per-address verdict plus an aggregate roll-up (worst verdict, counts by severity, how many carry a CEX listing blocker), for triaging a listing set.
- `check_extension_compatibility` takes `{ extensions: string[] }` (extension ids such as `transfer-hook`, `permanent-delegate`, `scaled-ui-amount`) and returns the conflicts and integration posture of a planned set, before any mint exists.
- `scaffold_mint` takes `{ extensions: string[], decimals?: number }` and returns an init plan plus TypeScript mint-creation code with the order and sizing correct, refusing any set the runtime would reject at init.
- `generate_hook_transfer` takes `{ mint: string, hookProgramId: string, decimals?: number }` and returns a correct transfer client for a hooked mint, with the extra accounts resolved against the Execute account set, plus a static classification of the hook's extra-account model.

Register them by pointing an MCP client at that command.

## Tests

```bash
npm test           # tsc --noEmit, then the suite (one file per process, retries only on a LiteSVM native crash)
```

**98 tests, offline and deterministic** (plus a CI-gated live mainnet smoke test). The risk engine, the value-aware transfer-fee logic, the renounce-to-remediate projection, the batch triage, the compatibility checker, the build-time scaffold generator, and the transfer-hook integration codegen are tested as pure functions, including the conditional-severity model (a renounced permanent delegate downgrades to low and clears the CEX block; a no-program hook is medium, an active hook is high), the magnitude escalation (a near-100% fee is critical even when the authority is renounced), and the three-state authority decode (None vs the zero/System key vs a live key); the decoder is tested against Token-2022 mints built in LiteSVM, against ten captured mainnet mints (PYUSD, USDG, USDC, USDT, wSOL, BONK, JUP, BERN, sUSD, and a WNS hooked NFT) decoded from committed account bytes, and against a built token account (withheld fees, immutable owner); the MCP handlers are tested with an injected fetcher, including a five-mint batch triaged against the captured mainnet data. The second-hop hook-program analysis (immutable vs upgradeable) is tested against the captured WNS hook program. All IO is isolated in `src/fetch-account.ts` and injected in tests: the mint read, plus the hook program and its ProgramData header when a hook is active.

### Scored eval suite

```bash
npm run evals      # run evals.json through the engine; prints a PASS/FAIL table and an accuracy
```

`evals.json` turns the executable rows of [EVALS.md](../../EVALS.md) into 21 scored cases (11 of them over real mainnet mints): each feeds a planned extension set (with authority liveness) or a captured mainnet mint through the same risk engine the MCP tools call, then checks the produced verdict (severity, 0-to-100 score, CEX blockers, conflicts, decoded extensions, or remediation path). A vitest gate (`tests/evals.test.ts`) runs the same suite under `make verify` and fails the build if any verdict regresses. Latest run: 21 of 21 cases pass (100%), 11 of them over real mainnet mints (10 distinct captured mints; PYUSD is exercised in two cases).

## Dependency advisories

`npm audit` reports advisories that are all transitive in the pinned June 2026 stack, and they match the other examples in this repo:

- `bigint-buffer` and `uuid`: pulled in by `@solana/web3.js` 1.x and `@solana/spl-token` 0.4.x. The advised fix downgrades `@solana/spl-token` to 0.1.8, which removes Token-2022 entirely, so it is not applied.
- `esbuild` and `vitest`/`@vitest/mocker`: pulled in by the test runner. The `@vitest/mocker` advisory only applies when the Vitest UI server is running; the suite runs headless with `vitest run`, never `--ui`. These do not ship with the tool.

None are reachable in the read-only inspection path (a `getAccountInfo` read for the mint, plus the hook program and its ProgramData header when a hook is active, then typed decoding). The pinned stack is kept on purpose; revisit when the Solana client line and the runner have non-breaking upgrades.

## Layout

```
src/
  extension-catalog.ts   ExtensionType to id and label, keyed off the spl-token enum plus interface-only codes
  decode-mint.ts         decode a mint account into a serializable structure (errors as values)
  assess-risk.ts         executable form of the skill's compatibility and integration rules
  inspect.ts             decode + assess, the second-hop hook enrichment, and the text report formatter
  hook-program.ts        second hop: decode the hook program's upgrade authority (immutable vs swappable)
  check-compatibility.ts transport-free check_extension_compatibility handler
  generate-mint.ts       build-time mint scaffold generator (vet + emit ordered, sized init code)
  hook-codegen.ts        transfer-hook integration codegen (resolve extra accounts, emit transfer client)
  inspect-many.ts        transport-free inspect_many batch handler plus the aggregate roll-up (one getMultipleAccounts round-trip)
  fetch-account.ts       the only IO: getAccountInfo reads (the mint, and the hook program for the second hop)
  cli.ts                 CLI entry (one address, or several for a batch triage)
  mcp-tool.ts            transport-free inspect_mint handler (testable with an injected fetcher)
  mcp-server.ts          thin MCP stdio server exposing the five tools
  mainnet-fixtures.ts    captured mainnet mint accounts (PYUSD, USDG, USDC, USDT, wSOL, BONK, JUP, BERN, sUSD, BNDRG) for offline decode and evals
  evals.ts               scored eval suite engine (schema, runner, accuracy)
  evals-cli.ts           npm run evals entry: load evals.json, run, print table + accuracy
tests/                   pure risk, compatibility, and scaffold tests, LiteSVM decode tests, captured-mint decodes, MCP handler tests, the scored eval gate, a gated live-RPC smoke test
evals.json               scored eval cases (run with npm run evals)
```
