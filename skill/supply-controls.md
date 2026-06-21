# Supply and control extensions

These mint extensions control who can move or freeze tokens and how supply behaves. Several grant strong authority, so disclose them to holders and integrators.

## Non-Transferable (soulbound)
The token cannot be transferred. Burning is still allowed. The ATA pairs it with Immutable Owner. With Non-Transferable, a transfer fee or transfer hook is moot (see [compatibility-matrix.md](compatibility-matrix.md)).
- `createInitializeNonTransferableMintInstruction(mint, TOKEN_2022_PROGRAM_ID)` before `InitializeMint`.

## Permanent Delegate
A fixed authority that can transfer or burn tokens from any account of the mint. Used for regulated assets and clawback. It is a strong power and a trust assumption for every holder and integrator.
- Does not reach tokens held in a confidential balance. Pair with default-frozen accounts if you rely on it for compliance.

## Default Account State
New token accounts start in a chosen state, typically Frozen, for allowlist or KYC gating. A freeze authority thaws an account after approval.
- Vault and transfer logic must thaw accounts first, or funds can be stranded.

## Mint Close Authority
Allows closing the mint account to reclaim its rent once supply is zero. Without it, the mint account cannot be closed.

## Pausable
A pause authority can halt all transfers, mints, and burns by flipping a flag. Integrators must handle the paused state, since every token operation aborts while paused.

## Disclosure
Permanent Delegate, Default Account State, and Pausable change the trust model. State them plainly in token docs and to any venue that lists the token.

Sources: SPL Token-2022 extensions reference (https://www.solana-program.com/docs/token-2022/extensions), Neodyme Token-2022 security review (https://neodyme.io/en/blog/token-2022/).
