# Confidential transfers: status and history (read before writing any code)

Confidential transfers let a Token-2022 mint hide transfer amounts using ElGamal encryption and zero-knowledge proofs verified by the native ZK ElGamal Proof Program. The feature family includes ConfidentialTransfer, ConfidentialTransferFee, and Confidential Mint and Burn.

## Current status: disabled on mainnet

Confidential transfers and the ZK ElGamal Proof Program have been disabled on Solana mainnet since June 2025, and remain disabled as of June 2026.

- A soundness bug in proof verification (a missing element in the Fiat-Shamir transcript that allowed a forgeable proof) was mitigated by a Token-2022 program update deployed on 2025-06-11, and the ZK ElGamal Proof Program was disabled on mainnet-beta on 2025-06-19 at the start of epoch 805. No exploit is known to have occurred.
- Re-enablement is tracked in solana-program/token-2022 issue #657, still open as of mid-2026. After Code4rena, Least Authority, ZkSecurity, and Trail of Bits audits, the updated program was rolled out to testnet and devnet (per the issue's May 2026 update), but it is still not re-enabled on mainnet and no mainnet date is set.

Do not present confidential-transfer code as production ready in 2026. If a user asks for it:
1. State plainly that the feature is disabled on mainnet and link the tracking issue.
2. Offer the available alternatives for the user's actual goal (for example a permissioned mint with Default Account State, or off-chain privacy), not dead code.
3. If the user is building for a future re-enablement, mark the code clearly as not deployable today, and pin to the official examples once the audits complete.

## Why this matters for a builder
- A mint cannot combine confidential transfer with a transfer hook, because a hook needs the cleartext amount.
- A permanent delegate does not reach confidentially held balances. A compliance design that relies on a permanent delegate must also freeze accounts by default or disable confidential balances.
- Wallet and DEX support for confidential transfers is narrow even when the feature is enabled. Treat it as opt-in with limited integration.

## What to do today
- For amount privacy on mainnet, there is no live Token-2022 path right now. Document that constraint instead of shipping code that cannot run.
- Watch issue #657 for the re-enable timeline and the post-audit examples.
- Contingency: if issue #657 closes and confidential transfers are re-enabled on mainnet (they already run on testnet and devnet), this status flips. Treat confidential-transfer code as live, re-check wallet and DEX support, and update the inspector finding and this file. Until that issue closes, assume disabled on mainnet.

Sources: ZK ElGamal post-mortem June 2025 (https://solana.com/news/post-mortem-june-25-2025), re-enable tracking issue (https://github.com/solana-program/token-2022/issues/657), SPL Token-2022 extensions reference (https://www.solana-program.com/docs/token-2022/extensions).
