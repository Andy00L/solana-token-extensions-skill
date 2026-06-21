# Token-2022 extension compatibility matrix

Some extensions cannot be combined, some must be initialized in a specific order, and some create integration caveats even when they are valid. Validate any extension set against this file before writing code.

## Mutually exclusive or pointless pairs

| Combination | Status | Why |
|-------------|--------|-----|
| Non-Transferable + Transfer Hook | Logically incompatible | Non-Transferable blocks every transfer, so a hook can never run. Anchor flags the pair, but the base program may still let the mint initialize (verified against the Token-2022 build bundled in LiteSVM, which accepted the init). Pick one; do not rely on an init-time error. |
| Non-Transferable + Transfer Fee | Pointless, treat as disallowed | A non-transferable token never transfers, so a transfer fee can never apply. |
| Confidential Transfer + Transfer Hook | Incompatible | A hook needs the cleartext transfer amount; confidential transfers hide it, so they cannot coexist. |

## Order-dependent (compatible, but order matters)

| Rule | Detail |
|------|--------|
| Fixed-length mint extensions before InitializeMint | All fixed extension config instructions (Transfer Fee, Metadata Pointer, Interest-Bearing, and so on) run before `InitializeMint`. `CreateAccount`, the config instructions, and `InitializeMint` must be in the same transaction. |
| Token Metadata after InitializeMint | The Token Metadata extension is variable length, so it is initialized after `InitializeMint` through the metadata interface. |
| Account sizing | `getMintLen` counts the Metadata Pointer but not the Token Metadata. Add `TYPE_SIZE + LENGTH_SIZE + pack(metadata).length` for the metadata, then fund rent for the total. |

## Behavior and integration caveats

| Item | Caveat |
|------|--------|
| Transfer Hook on self-transfer | The hook is not called when source and destination are the same account. Do not rely on a hook as the only guard for an invariant a self-transfer could break. |
| Permanent Delegate vs confidential balances | The permanent delegate does not reach tokens held in a confidential balance. A holder could move tokens out of delegate reach through confidential balances. Mitigate with default-frozen accounts. |
| Transfer Fee for integrators | The fee is taken from the received amount and withheld on the recipient account, not charged to the sender separately. Escrows and routers must account for the delta, and an account cannot be closed while it holds unharvested withheld fees. |
| Permanent Delegate trust | The delegate holder can move or burn anyone's tokens. Disclose this to holders and to any integrator. |
| Default Account State frozen | New accounts can be frozen by default. Vault and transfer logic can strand funds if it does not thaw accounts first. |
| Pausable | When paused, the program aborts all transfers, mints, and burns. Integrators must handle the paused state. |

## Ordered initialization recipe (fixed mint extensions plus metadata)

1. Compute space with `getMintLen([... fixed extension types ...])`, then add the metadata length.
2. `SystemProgram.createAccount` for the mint with that space and the matching rent.
3. One initialize instruction per fixed extension (for example transfer fee, metadata pointer, interest-bearing).
4. `InitializeMint2` with decimals and authorities.
5. Initialize Token Metadata, then any additional metadata fields, through the metadata interface.
6. Send steps 2 through 4 in a single transaction. Step 5 can be in the same or a following transaction.

## What changed in 2025 and 2026 (read before quoting older guides)
- Confidential transfers and the ZK ElGamal Proof Program are disabled on mainnet (disabled June 2025, still disabled as of June 2026, tracking issue solana-program/token-2022 #657). Do not present confidential-transfer code as live. See [confidential-transfer.md](confidential-transfer.md).
- `solana-bankrun` is deprecated in favor of LiteSVM. A guide that recommends bankrun is stale.
- `@solana/web3.js` 2.x was renamed `@solana/kit` (v6 line). The v1 line continues under `@solana/spl-token`.
- Anchor reached 1.0 in April 2026. Pin to 1.0.x or use native Rust.

Sources: Solana transfer fee guide (https://solana.com/docs/tokens/extensions/transfer-fees), metadata pointer guide (https://solana.com/developers/guides/token-extensions/metadata-pointer), SPL Token-2022 extensions reference (https://www.solana-program.com/docs/token-2022/extensions), Anchor token extensions docs (https://www.anchor-lang.com/docs/tokens/extensions), Neodyme Token-2022 security review (https://neodyme.io/en/blog/token-2022/), ZK ElGamal post-mortem June 2025 (https://solana.com/news/post-mortem-june-25-2025), re-enable tracking issue (https://github.com/solana-program/token-2022/issues/657).
