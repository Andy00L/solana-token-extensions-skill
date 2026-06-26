# Transfer hook security and audit checklist

A transfer hook runs on every transfer of its mint. A buggy or malicious hook can block transfers, grief integrators, or freeze a token. This file is the checklist for writing and for auditing a hook. The example program in `examples/transfer-hook-allowlist` implements the in-program checks below (fail closed, the transferring-flag gate, read-only handling, mint and account-linkage validation, and per-(mint, destination) PDA scoping) and follows the operational guidance (items 10 to 12). Its allow and block paths are proven by an end-to-end test through a real Token-2022 transfer.

## Threat model
- A hook author can block specific recipients, exhaust compute to freeze all transfers, or require accounts an integrator cannot provide.
- An integrator that accepts an arbitrary Token-2022 mint inherits that mint's hook. Simulate a transfer, including the hook, before trusting a mint.

## Checklist

1. Fail closed. The `Execute` handler denies by default and allows only on an explicit, validated condition. Never default to allow on a missing or malformed account.
2. Gate on the transferring flag. Read the `transferring` flag that Token-2022 sets on the token accounts during a transfer, and reject if it is false. This stops `Execute` from being called standalone to mutate hook state.
3. Assume no signer privileges. Token-2022 converts all transfer accounts to read only in the hook CPI. The sender's signature does not extend to the hook. Never require a signer you will not receive.
4. Validate the mint. Confirm the mint passed equals the mint your PDAs are scoped to. Otherwise an arbitrary mint can drive your hook against your own PDAs.
5. Validate account linkage. Check that each token account's `mint` field matches the expected mint. Do not trust account order alone. Neodyme singles out the transferring-flag gate (item 2) and this mint restriction (items 4 and 5) as the two mandatory checks for any hook, because any mint can call your hook program; the example in `examples/transfer-hook-allowlist` implements both and scopes its allow PDA to `[allow, mint, destination]`.
6. ExtraAccountMetaList correctness. The on-chain list must match exactly what `Execute` reads. Write and resolve it with `spl-tlv-account-resolution`, and test that off-chain resolution reproduces the on-chain order. A mismatch bricks every transfer of the token.
7. Correct signer and writable flags. Mark an extra account writable or signer only when it truly must be. Over-broad flags expand the attack surface and can make legitimate transfers fail when the resolver cannot satisfy them.
8. Bounded compute. The hook runs inside every transfer. Avoid loops over caller-controlled account sets and external CPIs whose cost a griefer can inflate. A hook that exceeds the compute limit blocks all transfers of the token.
9. No reentrancy. Treat the hook as a leaf. Do not CPI back into a Token-2022 transfer from inside the hook.
10. Fee-on-transfer interaction. If the mint also has a transfer fee, the amount the hook sees is affected by the fee. Any amount-based logic must use the documented fee semantics: the fee is taken from the received amount.
11. Self-transfer bypass. The hook is not called on self-transfers. Never use the hook as the sole enforcement for an invariant a self-transfer could violate.
12. Upgrade authority and mutability. Document who can upgrade the hook program and update the ExtraAccountMetaList. A mutable hook is a rug vector for integrators. Prefer a documented, ideally locked, upgrade authority.

## For integrators accepting Token-2022 mints
- Reject or quarantine mints whose hook program is unknown or unaudited.
- Simulate the full transfer, with the hook and its extra accounts, before quoting or settling.
- Account for the transfer fee delta and for a possible paused state.

Sources: Transfer Hook interface (https://spl.solana.com/transfer-hook-interface), Transfer Hook guide (https://solana.com/developers/guides/token-extensions/transfer-hook), spl-tlv-account-resolution (https://docs.rs/spl-tlv-account-resolution), Neodyme Token-2022 security review (https://neodyme.io/en/blog/token-2022/).
