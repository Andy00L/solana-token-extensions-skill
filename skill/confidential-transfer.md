# Confidential transfers: status and history (read before writing any code)

Confidential transfers let a Token-2022 mint hide transfer amounts using ElGamal encryption and zero-knowledge proofs verified by the native ZK ElGamal Proof Program. The feature family includes ConfidentialTransfer, ConfidentialTransferFee, and Confidential Mint and Burn.

## Current status: disabled on mainnet

As of June 2026, confidential transfers and the ZK ElGamal Proof Program are disabled on Solana mainnet.

- In June 2025 a soundness bug was found in the proof verification (a forgeable proof path). The ZK ElGamal Proof Program was disabled, and the feature was gated off at a mainnet epoch boundary.
- Re-enablement is tracked in solana-program/token-2022 issue #657, which is open and was last updated in May 2026. It states the features remain unavailable pending completion of additional security audits.

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

Sources: ZK ElGamal post-mortem June 2025 (https://solana.com/news/post-mortem-june-25-2025), re-enable tracking issue (https://github.com/solana-program/token-2022/issues/657), SPL Token-2022 extensions reference (https://www.solana-program.com/docs/token-2022/extensions).
