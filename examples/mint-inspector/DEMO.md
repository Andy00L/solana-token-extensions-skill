# Mint inspector demo (captured 2026-06-24)

![The mint inspector decoding PYUSD](demo.gif)

Real output from the shipped CLI and the `check_extension_compatibility` core, run against Solana mainnet-beta. Supply and authorities are live values that drift over time; the severity model is deterministic. Severity is conditional: a fund-loss-grade extension scores high only while its controlling authority is live, and a 0-to-100 risk score plus a per-finding `fix:` line make the report actionable. Reproduce with `npm install` then the commands below.

## 1. A live Token-2022 mint: PayPal USD (PYUSD)

```
$ npm run inspect -- 2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo

Token-2022 mint inspection
  Address:          2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo
  Program:          token-2022 (TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb)
  Decimals:         6
  Mint authority:   8Jornc27vtAYPkwDzsZVgLQchAYyC8nD7aCNPCDV8Qk2
  Freeze authority: 2apBGMsS6ti9RyF5TwQTDswXBWskiJP2LD4cUEDqYJjk

Extensions (8):
  - Mint Close Authority [mint-close-authority]
      closeAuthority: 2apBGMsS6ti9RyF5TwQTDswXBWskiJP2LD4cUEDqYJjk
  - Permanent Delegate [permanent-delegate]
      delegate: 2apBGMsS6ti9RyF5TwQTDswXBWskiJP2LD4cUEDqYJjk
  - Transfer Fee [transfer-fee]
      basisPoints: 0
      feeConfigAuthority: 2apBGMsS6ti9RyF5TwQTDswXBWskiJP2LD4cUEDqYJjk
  - Confidential Transfer [confidential-transfer]
  - Confidential Transfer Fee [confidential-transfer-fee]
  - Transfer Hook [transfer-hook]
      programId: none
  - Metadata Pointer [metadata-pointer]
  - Token Metadata [token-metadata]
      name: PayPal USD
      symbol: PYUSD

Verdict: CRITICAL (risk score 100/100)
Integration findings (10):
  [CRITICAL] Permanent delegate can seize or burn any balance (wallet, dex, cex)
      A live permanent delegate can transfer or burn tokens from any account of this mint, and
      account owners cannot revoke it. It survives a renounced mint and freeze authority and
      locked liquidity. This is the marquee fund-loss extension.
      fix: Renounce the permanent delegate (set it to none) unless seizure is an intended, disclosed feature.
      source: skill/supply-controls.md, skill/integration-compatibility.md
  [HIGH] Confidential transfer extension present (wallet, dex, cex)
      Disabled on mainnet-beta since June 2025 (issue token-2022#657 open); a patched, re-audited
      runtime reached supermajority stake adoption around April 2026, so re-enablement is pending.
      fix: Do not rely on confidential operations on mainnet today; track issue token-2022#657.
      source: skill/confidential-transfer.md
  [MEDIUM] Transfer fee is withheld on receive (dex, cex)
      A live fee-config authority can raise the rate (subject to a roughly two-epoch delay and the
      maximum-fee cap); Jupiter excludes such tokens from Limit and Recurring orders while allowing
      Instant swaps.
      fix: Use the net received amount; renounce the fee-config authority to lock the rate.
      source: skill/transfer-fee.md, skill/integration-compatibility.md
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
  CEX listing blockers:  permanent-delegate, confidential-transfer
  DEX routing frictions: permanent-delegate, confidential-transfer, transfer-fee, transfer-hook
  Wallet caveats:        permanent-delegate, confidential-transfer, transfer-hook, freeze-authority
```

(Findings below MEDIUM trimmed to their headline for space.) PYUSD scores **CRITICAL** because its permanent delegate is live, the marquee fund-seizure capability. The hook extension carries no program, so it is a medium latent caveat, not a hard listing blocker (contrast with an active hook below). All eight extensions are named, including the confidential transfer fee (code 16) that the published `@solana/spl-token` enum does not map. `CRITICAL` is capability, not intent: the report states the power an authority holds and lets you decide whether you trust the controller.

## 2. A classic SPL Token mint: USDC

```
$ npm run inspect -- EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v

Token-2022 mint inspection
  Address:          EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
  Program:          spl-token (TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA)
  Decimals:         6
  Mint authority:   BJE5MMbqXjVwjAF7oxwPYXnTXDyspzZyt4vwenNw5ruG
  Freeze authority: 7dGbd2QZcCKcTndnHcTL8q7SMVXAkp688NTQYwrRCrar

Classic SPL Token mint: no Token-2022 extensions.
```

## 3. Vet a planned extension set before building (check_extension_compatibility)

The same risk engine, applied to a proposed set of extension ids instead of a live mint. Authorities are assumed live (the conservative default before a mint exists). This is the second MCP tool an agent can call. Example: a regulated stablecoin design.

```
extensions: transfer-fee, permanent-delegate, default-account-state, pausable, metadata-pointer, token-metadata

Verdict: CRITICAL (risk score 100/100)
Integration findings (6):
  [CRITICAL] Permanent delegate can seize or burn any balance (wallet, dex, cex)
      fix: Renounce the permanent delegate unless seizure is an intended, disclosed feature.
  [MEDIUM] Transfer fee is withheld on receive (dex, cex)
  [MEDIUM] New accounts may be frozen by default (wallet, dex)
  [MEDIUM] Pausable: transfers can be halted (dex, cex)
  [INFO] Metadata pointer set (informational)
  [INFO] On-chain token metadata (informational)

Posture:
  CEX listing blockers:  permanent-delegate, pausable
  DEX routing frictions: permanent-delegate, transfer-fee, default-account-state, pausable
  Wallet caveats:        permanent-delegate, default-account-state
```

The design is valid (no conflicts), but the permanent delegate makes it CRITICAL and the pause authority is a second listing blocker. The tool surfaces that, with a concrete fix for each, before a single line of mint code is written. Renounce the permanent delegate and the same set drops to a medium posture, exactly the kind of trade-off the conditional model makes visible.
