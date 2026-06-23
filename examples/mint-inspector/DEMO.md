# Mint inspector demo (captured 2026-06-22)

![The mint inspector decoding PYUSD](demo.gif)

Real output from the shipped CLI and the `check_extension_compatibility` core, run against Solana mainnet-beta. Supply and authorities are live values that drift over time; everything else is deterministic. Reproduce with `npm install` then the commands below.

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
      maximumFee: 0
  - Confidential Transfer [confidential-transfer]
  - Confidential Transfer Fee [confidential-transfer-fee]
  - Transfer Hook [transfer-hook]
      programId: none
  - Metadata Pointer [metadata-pointer]
      metadataAddress: 2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo
  - Token Metadata [token-metadata]
      name: PayPal USD
      symbol: PYUSD
      uri: https://token-metadata.paxos.com/pyusd_metadata/prod/solana/pyusd_metadata.json

Integration findings (8), overall severity: high
  [HIGH]   Permanent delegate can move or burn any balance (cex)
  [HIGH]   Confidential transfer extension present (wallet, dex, cex)
  [HIGH]   Transfer hook runs on every transfer (wallet, dex, cex)
  [MEDIUM] Transfer fee is withheld on receive (dex, cex)
  [LOW]    Mint can be closed at zero supply (cex)
  [INFO]   Confidential transfer fee configured
  [INFO]   Metadata pointer set
  [INFO]   On-chain token metadata

Conflicts (1):
  [LOW] Confidential Transfer with Transfer Hook: the hook sees no real amount on confidential transfers
      The two are compatible and coexist on a mint (PYUSD carries both). The hook fires on
      every transfer, but on a confidential transfer Token-2022 passes the hook u64::MAX rather
      than the cleartext amount, so amount-dependent hook logic applies only to regular transfers.

Posture:
  CEX listing blockers:  permanent-delegate, confidential-transfer, transfer-hook
  DEX routing frictions: confidential-transfer, transfer-hook, transfer-fee
  Wallet caveats:        confidential-transfer, transfer-hook
```

All eight extensions are named, including the confidential transfer fee (code 16) that the published `@solana/spl-token` enum does not map. The confidential-transfer-with-hook line is a low caveat, not an incompatibility: PYUSD runs both on mainnet.

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

The same risk engine, applied to a proposed set of extension ids instead of a live mint. This is the second MCP tool an agent can call. Example: a regulated stablecoin design.

```
extensions: transfer-fee, permanent-delegate, default-account-state, pausable, metadata-pointer, token-metadata

Integration findings (6), overall severity: high
  [HIGH]   Permanent delegate can move or burn any balance (cex)
  [MEDIUM] Transfer fee is withheld on receive (dex, cex)
  [MEDIUM] New accounts may be frozen by default (wallet, dex)
  [MEDIUM] Pausable: transfers can be halted (dex, cex)
  [INFO]   Metadata pointer set
  [INFO]   On-chain token metadata

Posture:
  CEX listing blockers:  permanent-delegate, pausable
  DEX routing frictions: transfer-fee, default-account-state, pausable
  Wallet caveats:        default-account-state
```

The design is valid (no conflicts) but the permanent delegate and pause authority are the two things a centralized exchange will scrutinize before listing. The tool surfaces that before a single line of mint code is written.
