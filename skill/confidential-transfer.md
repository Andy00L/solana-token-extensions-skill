# Confidential transfers: status and history (read before writing any code)

Confidential transfers let a Token-2022 mint hide transfer amounts using ElGamal encryption and zero-knowledge proofs verified by the native ZK ElGamal Proof Program. The feature family includes ConfidentialTransfer, ConfidentialTransferFee, and Confidential Mint and Burn.

## Current status: re-enabled on mainnet (2026-06-04)

The ZK ElGamal Proof Program was re-enabled on Solana mainnet-beta on 2026-06-04, ending a roughly one-year disablement. This is verifiable from on-chain state, not only from the tracking issue:

- The feature gate `reenable_zk_elgamal_proof_program` (`zkexuyPRdyTVbZqEAREueqL2xvvoBhRgth9xGSc1tMN`) is active (activation slot 424224000, block time 2026-06-04). It post-dates the disable gate `disable_zk_elgamal_proof_program` (active 2025-06-19), so the net state is enabled.
- The ZK ElGamal Proof Program account `ZkE1Gama1Proof11111111111111111111111111111` is executable again.
- The Token-2022 program data was redeployed on 2026-06-17.

History:

- A soundness bug (a missing element in the Fiat-Shamir transcript of the PercentageWithCapProof that allowed a forgeable proof, disclosed by zkSecurity) disabled the ZK ElGamal Proof Program on mainnet-beta on 2025-06-19 at the start of epoch 805. No exploit is known to have occurred.
- The patched program was re-audited (a Solana Foundation Code4rena contest in 2025, plus reviews by Least Authority, zkSecurity, Trail of Bits, and QEdit) before the 2026-06-04 re-enablement.

Caveats (handle with care, not ship freely):

- Tooling is still catching up. Wallet, DEX, and indexer support for confidential balances is narrow.
- Confidential balances are not publicly visible, so a CEX cannot reconcile them for accounting or AML without the auditor key; expect a compliance review.
- The tracking issue solana-program/token-2022 #657 was still open at its last comment (2026-05-08, referencing testnet and devnet); the on-chain feature gate is the authoritative signal that mainnet is live again. Send a mainnet test transaction before relying on it in production.

## Why this matters for a builder

- Confidential transfer and a transfer hook can coexist on one mint (PYUSD carries both), but on a confidential transfer the program passes the hook `u64::MAX` instead of the cleartext amount, so any amount-dependent hook logic applies only to regular transfers. See [compatibility-matrix.md](compatibility-matrix.md).
- A permanent delegate does not reach confidentially held balances. A compliance design that relies on a permanent delegate must also freeze accounts by default or disable confidential balances.
- Required companions, enforced at init: a mint combining a transfer fee with confidential transfers must also carry the confidential-transfer-fee config, and a confidential mint-and-burn mint must also enable confidential transfers. The runtime rejects the incomplete combinations with InvalidExtensionCombination.

## What to do today

- Confidential operations work on mainnet again as of 2026-06-04, but verify that your wallet, DEX, and custody stack support confidential balances end to end before relying on them, and plan for the compliance review a non-public balance invites.
- For a CEX listing, expect the opaque-balance and auditor-key model to be reviewed.
- Watch issue #657 for the official mainnet confirmation and the post-audit examples.

Sources: ZK ElGamal post-mortem June 2025 (https://solana.com/news/post-mortem-june-25-2025), zkSecurity disclosure (https://blog.zksecurity.xyz/posts/solana-phantom-challenge-bug/), re-enablement tracking issue (https://github.com/solana-program/token-2022/issues/657), the on-chain feature gates `reenable_zk_elgamal_proof_program` and `disable_zk_elgamal_proof_program`, SPL Token-2022 extensions reference (https://www.solana-program.com/docs/token-2022/extensions).
