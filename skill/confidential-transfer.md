# Confidential transfers: status and history (read before writing any code)

Confidential transfers let a Token-2022 mint hide transfer amounts using ElGamal encryption and zero-knowledge proofs verified by the native ZK ElGamal Proof Program. The feature family includes ConfidentialTransfer, ConfidentialTransferFee, and Confidential Mint and Burn.

## Current status: disabled on mainnet

Confidential transfers and the ZK ElGamal Proof Program have been disabled on Solana mainnet since June 2025, and remain disabled as of mid-2026, with re-enablement pending (not permanent).

- A soundness bug in proof verification (a missing element in the Fiat-Shamir transcript of the PercentageWithCapProof that allowed a forgeable proof, disclosed by zkSecurity) was mitigated by a Token-2022 program update deployed on 2025-06-11, and the ZK ElGamal Proof Program was disabled on mainnet-beta on 2025-06-19 at the start of epoch 805. No exploit is known to have occurred.
- Re-enablement is tracked in solana-program/token-2022 issue #657, still open as of mid-2026. The fix was re-audited (a Solana Foundation Code4rena contest in August to September 2025, plus Asymmetric Research, Neodyme, and OtterSec reviews), and a patched runtime reached supermajority stake adoption around April 2026, so re-enablement is advanced. Important: validator patch adoption is not the same as the mainnet feature gate being re-activated. Until issue #657 closes and the gate flips, confidential transfers stay disabled on mainnet, and no mainnet date is set.

Do not present confidential-transfer code as production ready in 2026. If a user asks for it:
1. State plainly that the feature is disabled on mainnet and link the tracking issue.
2. Offer the available alternatives for the user's actual goal (for example a permissioned mint with Default Account State, or off-chain privacy), not dead code.
3. If the user is building for a future re-enablement, mark the code clearly as not deployable today, and pin to the official examples once the audits complete.

## Why this matters for a builder
- Confidential transfer and a transfer hook can coexist on one mint (PYUSD carries both), but on a confidential transfer the program passes the hook `u64::MAX` instead of the cleartext amount, so any amount-dependent hook logic applies only to regular transfers. See [compatibility-matrix.md](compatibility-matrix.md).
- A permanent delegate does not reach confidentially held balances. A compliance design that relies on a permanent delegate must also freeze accounts by default or disable confidential balances.
- Wallet and DEX support for confidential transfers is narrow even when the feature is enabled. Treat it as opt-in with limited integration.

## What to do today
- For amount privacy on mainnet, there is no live Token-2022 path right now. Document that constraint instead of shipping code that cannot run.
- Watch issue #657 for the re-enable timeline and the post-audit examples.
- Contingency: if issue #657 closes and the mainnet feature gate is re-activated, this status flips. Treat confidential-transfer code as live, re-check wallet and DEX support, and update the inspector finding and this file. Until that gate flips, assume disabled on mainnet even though the patched runtime is already widely adopted.

Sources: ZK ElGamal post-mortem June 2025 (https://solana.com/news/post-mortem-june-25-2025), zkSecurity disclosure (https://blog.zksecurity.xyz/posts/solana-phantom-challenge-bug/), Solana Foundation Code4rena audit (https://code4rena.com/audits/2025-08-solana-foundation), re-enable tracking issue (https://github.com/solana-program/token-2022/issues/657), SPL Token-2022 extensions reference (https://www.solana-program.com/docs/token-2022/extensions).
