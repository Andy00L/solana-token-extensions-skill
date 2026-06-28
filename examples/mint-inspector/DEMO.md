# Mint inspector demo (captured 2026-06-28)

![The mint inspector decoding PYUSD](demo.gif)

Real output from the shipped CLI, run against Solana mainnet-beta. Supply and authorities are live values that drift over time; the severity model is deterministic. Severity is conditional: a fund-loss-grade extension scores high only while its controlling authority is live, a 0-to-100 risk score plus a per-finding `fix:` line make the report actionable, and a renounce-to-remediate path turns the verdict into a plan. Reproduce with `npm install` then the commands below.

## 1. A live Token-2022 mint: PayPal USD (PYUSD)

```
$ npm run inspect -- 2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo

Token-2022 mint inspection
  Address:          2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo
  Program:          token-2022 (TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb)
  Decimals:         6
  Supply (raw):     717397756040620
  Mint authority:   8Jornc27vtAYPkwDzsZVgLQchAYyC8nD7aCNPCDV8Qk2
  Freeze authority: 2apBGMsS6ti9RyF5TwQTDswXBWskiJP2LD4cUEDqYJjk

Extensions (8):
  - Mint Close Authority [mint-close-authority]
      closeAuthority: 2apBGMsS6ti9RyF5TwQTDswXBWskiJP2LD4cUEDqYJjk
  - Permanent Delegate [permanent-delegate]
      delegate: 2apBGMsS6ti9RyF5TwQTDswXBWskiJP2LD4cUEDqYJjk
  - Transfer Fee [transfer-fee]
      basisPoints: 0
      maximumFee: 0
      feeConfigAuthority: 2apBGMsS6ti9RyF5TwQTDswXBWskiJP2LD4cUEDqYJjk
      withdrawWithheldAuthority: 2apBGMsS6ti9RyF5TwQTDswXBWskiJP2LD4cUEDqYJjk
  - Confidential Transfer [confidential-transfer]
  - Confidential Transfer Fee [confidential-transfer-fee]
  - Transfer Hook [transfer-hook]
      programId: none
      authority: 2apBGMsS6ti9RyF5TwQTDswXBWskiJP2LD4cUEDqYJjk
  - Metadata Pointer [metadata-pointer]
      metadataAddress: 2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo
      authority: 2apBGMsS6ti9RyF5TwQTDswXBWskiJP2LD4cUEDqYJjk
  - Token Metadata [token-metadata]
      name: PayPal USD
      symbol: PYUSD
      uri: https://token-metadata.paxos.com/pyusd_metadata/prod/solana/pyusd_metadata.json
      additionalFields: 0

Verdict: CRITICAL (risk score 100/100)
Integration findings (10):
  [CRITICAL] Permanent delegate can seize or burn any balance (wallet, dex, cex)
      A live permanent delegate can transfer or burn tokens from any account of this mint, and
      account owners cannot revoke it. This is the marquee fund-loss extension.
      fix: Renounce the permanent delegate (set it to none) unless seizure is an intended, disclosed feature.
      source: skill/supply-controls.md, skill/integration-compatibility.md
  [MEDIUM] Transfer fee is withheld on receive (dex, cex)
      A live fee-config authority can raise the rate (subject to a roughly two-epoch delay and the
      maximum-fee cap); Jupiter excludes such tokens from Limit and Recurring orders while allowing
      Instant swaps. The active fee here is 0 bps (a near-100% fee would escalate to critical).
      fix: Use the net received amount; renounce the fee-config authority to lock the rate.
      source: skill/transfer-fee.md, skill/integration-compatibility.md
  [MEDIUM] Confidential transfer extension present (wallet, dex, cex)
      Re-enabled on mainnet-beta on 2026-06-04 (gate reenable_zk_elgamal_proof_program), ending the
      disablement that ran from 2025-06-19. Balances are opaque, so wallet and DEX support is narrow
      and a CEX cannot reconcile them without the auditor key: an integration and compliance constraint.
      fix: Confirm wallet, DEX, and custody support before relying on confidential balances; expect a CEX compliance review.
      source: skill/confidential-transfer.md
  [MEDIUM] Transfer hook runs on every transfer (wallet, dex, cex)
      The transfer-hook extension is present but no hook program is set, so transfers run normally
      today; the hook authority can set one at any time. A latent caveat, not an active block.
      fix: If no hook is intended, renounce the hook authority; otherwise re-audit when a program is set.
      source: skill/integration-compatibility.md, skill/transfer-hook-security.md
  [MEDIUM] Freeze authority is live (accounts can be frozen) (wallet, cex)
      A live freeze authority can freeze any token account of this mint until it is thawed.
      fix: Confirm you trust the freeze authority; renounce it if accounts should never be freezable.
      source: skill/supply-controls.md
  [LOW] Mint can be closed at zero supply (cex)
  [LOW] Mint authority is live (supply is not fixed) (informational)
  [INFO] Confidential transfer fee configured (informational)
  [INFO] Metadata pointer set (informational)
  [INFO] On-chain token metadata (informational)

Conflicts (1):
  [LOW] Confidential Transfer with Transfer Hook: the hook sees no real amount on confidential transfers
      The two coexist on a mint (PYUSD carries both). The hook fires on every transfer, but on a
      confidential transfer Token-2022 passes the hook u64::MAX rather than the cleartext amount.

Posture:
  CEX listing blockers:  permanent-delegate
  DEX routing frictions: permanent-delegate, transfer-fee, confidential-transfer, transfer-hook
  Wallet caveats:        permanent-delegate, confidential-transfer, transfer-hook, freeze-authority

Remediation path (renounce a live authority to lower risk):
  current: CRITICAL (risk score 100/100)
  renounce permanent-delegate -> MEDIUM (80/100)
  renounce freeze-authority -> CRITICAL (100/100)
  renounce mint-authority -> CRITICAL (100/100)
  renounce mint-close-authority -> CRITICAL (100/100)
  renounce transfer-fee -> CRITICAL (100/100)
  renounce all of the above -> MEDIUM (45/100)
```

(Findings below MEDIUM trimmed to their headline for space.) PYUSD scores **CRITICAL** because its permanent delegate is live, the marquee fund-seizure capability. The hook extension carries no program, so it is a medium latent caveat, not a hard listing blocker (contrast with an active hook below). All eight extensions are named, including the confidential transfer fee (code 16) that the published `@solana/spl-token` enum does not map.

The **remediation path** is the headline of the tool: it recomputes the verdict for each authority the issuer could renounce. Renouncing the live permanent delegate is the single highest-impact action: it clears the only hard CEX blocker and drops the tier from CRITICAL to MEDIUM (80/100). The residual is the confidential-transfer extension (re-enabled but narrow support) and the latent transfer hook, which renouncing cannot remove, so even renouncing everything floors the mint at MEDIUM (45/100). The score is a path, not just a label. (Scores saturate at 100, so the severity tier is the primary signal; the all-renounced line shows the true reduction.)

## 2. Triage a whole listing set in one call (inspect_many)

Pass several addresses (or call the `inspect_many` MCP tool) to triage a set at once: a per-mint verdict, worst first, plus an aggregate. Built for "is my exchange's listing set safe."

```
$ npm run inspect -- 2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo \
    EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v \
    CKfatsPMUf8SkiURsDXs7eK6GWb4Jsd6UDbs7twMCWxo \
    susdabGDNbhrnCa6ncrYo81u4s9GM8ecK2UwMyZiq4X \
    8eDYWjDKmCR5B3UJm95gaG8zCdT5anWakTZG1PyWpBm9

Token-2022 batch inspection
  Addresses:         5
  Inspected:         5
  Failed:            0
  Worst verdict:     CRITICAL
  With CEX blockers: 2
  By severity:       critical 1, high 1, medium 2, low 0, info 1

Per address (worst first):
  [CRITICAL 100/100] 2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo (mint; CEX blockers: permanent-delegate)
  [HIGH 95/100] 8eDYWjDKmCR5B3UJm95gaG8zCdT5anWakTZG1PyWpBm9 (mint; CEX blockers: transfer-hook, transfer-hook-program)
  [MEDIUM 25/100] susdabGDNbhrnCa6ncrYo81u4s9GM8ecK2UwMyZiq4X (mint; no CEX blockers)
  [MEDIUM 15/100] CKfatsPMUf8SkiURsDXs7eK6GWb4Jsd6UDbs7twMCWxo (mint; no CEX blockers)
  [INFO 0/100] EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v (mint; no CEX blockers)
```

PYUSD (live permanent delegate) and BNDRG (active WNS transfer hook) carry CEX listing blockers; sUSD (interest-bearing), BERN (transfer fee), and USDC (classic SPL) do not. Two of five carry a blocker, surfaced in one call. Over RPC the batch takes the same second hop as a single inspect, so BNDRG is flagged HIGH 95/100 with the upgradeable-hook-program blocker, not the base HIGH 60/100 a plain extension decode would show (see section 7 for that mint's full report).

## 3. A classic SPL Token mint: USDC

```
$ npm run inspect -- EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

Token-2022 mint inspection
  Address:          EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
  Program:          spl-token (TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA)
  Decimals:         6
  ...
Classic SPL Token mint: no Token-2022 extensions.
```

## 4. Vet a planned extension set before building (check_extension_compatibility)

The same risk engine, applied to a proposed set of extension ids instead of a live mint. Authorities are assumed live (the conservative default before a mint exists). This is the third MCP tool an agent can call. Example: a regulated stablecoin design.

```
extensions: transfer-fee, permanent-delegate, default-account-state, pausable, metadata-pointer, token-metadata

Verdict: CRITICAL (risk score 100/100)
Integration findings (6):
  [CRITICAL] Permanent delegate can seize or burn any balance (wallet, dex, cex)
      fix: Renounce the permanent delegate unless seizure is an intended, disclosed feature.
  [HIGH] Pausable: transfers can be halted (dex, cex)
      A live pause authority can halt every transfer, mint, and burn mint-wide.
  [MEDIUM] Transfer fee is withheld on receive (dex, cex)
  [MEDIUM] New accounts may be frozen by default (wallet, dex)
  [INFO] Metadata pointer set (informational)
  [INFO] On-chain token metadata (informational)

Posture:
  CEX listing blockers:  permanent-delegate, pausable
  DEX routing frictions: permanent-delegate, transfer-fee, default-account-state, pausable
  Wallet caveats:        permanent-delegate, default-account-state
```

The design is valid (no conflicts), but the permanent delegate makes it CRITICAL and the pause authority is a second listing blocker. The tool surfaces that, with a concrete fix for each, before a single line of mint code is written.

## 5. Scaffold a correct mint from an extension set (scaffold_mint)

Beyond auditing, the same offline engine generates mint creation code. It vets the set first, refuses any combination the runtime would reject at init, and otherwise emits an init plan and TypeScript with the order and sizing correct (the two footguns). This is the fourth MCP tool an agent can call, also exposed as `--scaffold`.

```
$ npm run inspect -- --scaffold transfer-fee,metadata-pointer,token-metadata --decimals 6

Token-2022 mint scaffold
  Extensions:   transfer-fee, metadata-pointer, token-metadata
  Decimals:     6

Init plan (order is load-bearing):
  1. [create-account] SystemProgram.createAccount
       space = getMintLen(fixed extensions); fund rent for space + the token-metadata length
  2. [before-init-mint] createInitializeTransferFeeConfigInstruction
  3. [before-init-mint] createInitializeMetadataPointerInstruction
  4. [init-mint] createInitializeMint2Instruction
  5. [after-init-mint] createInitializeMetadataInstruction

Scaffold:
// ... ordered, correctly-sized TypeScript with placeholders to fill ...
```

An illegal set is refused before any code is generated:

```
$ npm run inspect -- --scaffold scaled-ui-amount,interest-bearing

Token-2022 mint scaffold: REJECTED
  The set is rejected by the runtime at initialization (InvalidExtensionCombination):
    - Scaled UI Amount with Interest-Bearing is rejected at init
  No code is generated for an illegal set.
```

## 6. Scored eval suite (npm run evals)

The executable rows of [EVALS.md](../../EVALS.md) run as a scored suite against the real risk engine, so correctness is a reproducible number, not a claim. It runs under `make verify` and as a standalone command:

```
$ npm run evals

Mint inspector eval suite (offline, deterministic)

  [PASS] scaled-ui-with-interest-bearing-rejected (EVALS #4)
  [PASS] confidential-with-hook-coexist (EVALS #5)
  [PASS] non-transferable-with-fee-pointless (EVALS #10)
  [PASS] vet-fee-delegate-pausable (EVALS #11)
  [PASS] permanent-delegate-renounced-low (EVALS #14)
  [PASS] permanent-delegate-live-critical-remediation (EVALS #17)
  [PASS] honeypot-fee-renounced-critical (EVALS #19)
  [PASS] normal-fee-renounced-low (EVALS #19)
  [PASS] scheduled-fee-jump-critical (EVALS #19)
  [PASS] pyusd-full-decode-code-16 (EVALS #13)
  [PASS] pyusd-latent-hook-and-remediation-floor (EVALS #15)
  [PASS] bndrg-active-hook-blocks (EVALS #15)
  [PASS] usdc-classic-spl-clean
  [PASS] bern-transfer-fee-decode
  [PASS] susd-interest-bearing-decode
  [PASS] confidential-mint-burn-requires-confidential-transfer
  [PASS] usdg-paxos-stablecoin-critical
  [PASS] usdt-classic-clean
  [PASS] wsol-classic-clean
  [PASS] bonk-classic-clean
  [PASS] jup-classic-clean

Accuracy: 21/21 cases passed (100%)
Real mainnet mints: 11/11 classified correctly
```

Each case feeds a planned extension set (with authority liveness) or a captured mainnet mint through the engine and checks the verdict: severity, the 0-to-100 score, CEX blockers, conflicts, decoded extensions, or the remediation path.

## 7. Follow an active hook to its program (the second hop)

When a mint has an active transfer hook, the inspector takes a second hop: it reads the hook program and its ProgramData header and reports whether the bytecode is immutable or upgradeable, the risk a mint decode alone cannot see. Here it is against BNDRG (a WNS-hooked NFT) on mainnet.

```
$ npm run inspect -- 8eDYWjDKmCR5B3UJm95gaG8zCdT5anWakTZG1PyWpBm9

Token-2022 mint inspection
  Address:          8eDYWjDKmCR5B3UJm95gaG8zCdT5anWakTZG1PyWpBm9
  Program:          token-2022 (TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb)
  ...
Extensions (5):
  - Metadata Pointer, Group Member Pointer, Mint Close Authority, Token Metadata
  - Transfer Hook [transfer-hook]
      programId: wns1gDLt8fgLcGhWi5MqAqgXpwEP1JftKE9eZnXS1HM
      authority:  BDrggjf4JfQ9R7kmYuGzVtWe7s4SZ86aubqsvmuvD1tm

Verdict: HIGH (risk score 95/100)
Integration findings (8):
  [HIGH] Transfer hook runs on every transfer (wallet, dex, cex)
      fix: Audit the hook program and its ExtraAccountMetaList, and simulate a full transfer including the hook before integrating.
  [HIGH] Transfer hook program is upgradeable (wallet, dex, cex)
      The active hook program can be replaced by its upgrade authority (yaoYaopKcDsMxnjbT1jBdvYz6XRmjPdAPHczsCraERc). Any review of the
      hook's current behavior is void once the bytecode is swapped, so an upgradeable hook can turn into a sell-blocker after launch.
      This is config-invisible: a mint decode alone cannot see it.
      fix: Confirm the hook program's upgrade authority is renounced (immutable), a burn address, or a trusted multisig before relying on a hook audit.
  [MEDIUM] Freeze authority is live (accounts can be frozen)
  [LOW] Mint can be closed at zero supply; [LOW] Mint authority is live; [INFO] x3

Posture:
  CEX listing blockers:  transfer-hook, transfer-hook-program

Remediation path (renounce a live authority to lower risk):
  current: HIGH (risk score 95/100)
  renounce transfer-hook -> HIGH (75/100)
  renounce freeze-authority -> HIGH (80/100)
  renounce mint-authority -> HIGH (90/100)
  renounce mint-close-authority -> HIGH (90/100)
  renounce all of the above -> HIGH (50/100)
```

(Findings below MEDIUM trimmed to their headline for space.) The first finding is what any tool flags: a hook is set. The second is the second hop: the hook **program** is upgradeable, so a clean audit of today's bytecode is void the moment its upgrade authority swaps it. The remediation path drives it home: even renouncing every authority the issuer controls, the mint stays HIGH (50/100), because the upgrade authority that can swap the hook bytecode is not the issuer's to renounce. That residual is exactly what a mint decode alone is blind to.

## Regenerating this demo

The CLI session shown above is scripted in [`demo.tape`](demo.tape) so the recording is reproducible. Regenerate `demo.gif` with [vhs](https://github.com/charmbracelet/vhs) (which needs `ttyd` and `ffmpeg` on PATH):

```bash
cd examples && make demo      # one command: checks for vhs, then renders mint-inspector/demo.gif
# or directly:
cd examples/mint-inspector && vhs demo.tape
```
