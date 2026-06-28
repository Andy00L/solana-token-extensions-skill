# Threat model and adversarial test map

Two parts of this skill ship executable code at a trust boundary: the example
transfer-hook program (on-chain, native Rust) and the mint inspector's risk engine
(off-chain TypeScript). Both are built to fail closed. This document lists the
threats each defends against and the exact test that proves the defense holds, so a
reviewer can see the negative paths, not just the happy path.

Reproduce every row with `cd examples && make verify`. The full run, including the
on-chain end-to-end scenario that needs `cargo build-sbf`, is recorded in
[examples/VERIFICATION_OUTPUT.txt](examples/VERIFICATION_OUTPUT.txt).

## 1. Transfer-hook allowlist program

Path: [examples/transfer-hook-allowlist](examples/transfer-hook-allowlist). It gates
Token-2022 transfers behind a per-(mint, destination) allow PDA that only the mint
authority can create. Design, grounded in [skill/transfer-hook-security.md](skill/transfer-hook-security.md)
and the Neodyme Token-2022 review:

- Deny by default. `Execute` allows a transfer only when both token accounts are
  mid-transfer (the `TransferHookAccount` transferring flag is set) and the
  destination's allow PDA exists, owned by this program with data.
- Account-to-mint linkage. Each token account is unpacked and checked against the
  mint in the instruction, so account order alone is never trusted.
- Allow PDA scoped to `[prefix, mint, destination]`, so two mints sharing this hook
  never share an allowlist.
- `AddToAllowlist` verifies the mint account is owned by the Token-2022 program
  before trusting its `mint_authority` (a `PodMint` unpack does not check the owner),
  then requires that authority to sign.
- The validation list is frozen: `UpdateExtraAccountMetaList` is rejected, so the
  resolved extra accounts cannot be swapped after init.

| Threat | Defense | Proof (test) |
|---|---|---|
| A non-allowlisted destination receives tokens | deny unless the allow PDA exists | `execute_denies_when_not_transferring`, e2e blocked-then-allowed scenario |
| `Execute` invoked standalone, outside a real transfer | require the transferring flag on source and destination | `execute_denies_when_not_transferring` |
| A look-alike or wrong-type account in a token slot | unpack and check account-to-mint linkage | `execute_rejects_a_mint_sized_source_account` |
| Too few accounts to satisfy a handler | reads fail closed (deny) | `execute_rejects_too_few_accounts`, `execute_with_five_accounts_is_rejected`, `initialize_requires_four_accounts`, `add_to_allowlist_requires_five_accounts` |
| A non-authority manages the allowlist | require the mint authority to sign | `add_to_allowlist_requires_signer`, `add_to_allowlist_rejects_a_non_authority_signer` |
| A forged non-Token-2022 account passed as the mint to spoof its authority | verify Token-2022 ownership before trusting any mint field | `add_to_allowlist_rejects_a_mint_not_owned_by_token_2022` |
| A renounced-authority mint that no one may manage | reject when `mint_authority` is None | `add_to_allowlist_rejects_a_mint_with_no_authority` |
| An attacker-chosen account substituted for the allow PDA | re-derive and require the (mint, destination) PDA, in both `AddToAllowlist` and `Execute` | `add_to_allowlist_rejects_an_unexpected_allow_pda` |
| Cross-mint allowlist reuse | scope the PDA seeds to the mint as well as the destination | `allow_pda_is_deterministic_and_scoped_to_mint_and_destination` |
| Replaying `AddToAllowlist` to corrupt state | idempotent no-op when the PDA already exists | `add_to_allowlist_is_idempotent_when_allow_account_exists` |
| The validation list swapped after init to reroute extra accounts | freeze it: reject `UpdateExtraAccountMetaList` | `update_extra_account_meta_list_is_rejected` |
| The extra-account-metas account is not the canonical PDA | re-derive and require the program-derived address | `initialize_rejects_a_wrong_extra_account_metas_pda` |
| Initialize called without the authority signing | require the authority to sign | `initialize_requires_authority_signer` |
| Our 8-byte discriminator collides with an interface instruction and misroutes | assert no interface instruction begins with it | `add_to_allowlist_discriminator_does_not_collide_with_interface_instructions` |
| Empty or garbage instruction data | reject before any account work | `process_rejects_empty_input` |
| Integrators need machine-checkable failure codes | fixed numeric error codes | `src/error.rs` stable-codes test |

## 2. Mint inspector risk engine

Path: [examples/mint-inspector](examples/mint-inspector). The engine is deterministic
and fails closed on malformed input. The point of these tests is that the engine is
hard to fool into calling a dangerous mint safe.

| Threat or edge | Behavior | Proof (test) |
|---|---|---|
| A live fund-loss authority on an otherwise benign mint | conditional severity: a permanent delegate is critical while live, low once renounced | `assess-risk.test.ts` permanent-delegate live/renounced |
| "Renounce to look safe" while a honeypot fee remains | magnitude escalation: a near-100% fee stays critical even when the fee authority is renounced | `assess-risk.test.ts` escalates a near-100% transfer fee even when renounced |
| A fee increase scheduled for a future epoch, hidden behind a low current rate | epoch-aware active fee plus a pending-jump flag | `real-mint-decode.test.ts` `resolveActiveFee` keeps the older fee active and flags the pending one |
| An authority set to the System/zero key passed off as renounced | treated as effectively renounced but distinguished from a clean None and from a live key | `real-mint-decode.test.ts` `isLiveAuthorityKey` (None vs Some(zero) vs Some(key)) |
| An illegal extension set presented as buildable | the five runtime-rejected combinations are flagged before any mint exists | `check-compatibility.test.ts` scaled-ui + interest-bearing; `assess-risk.test.ts` combination rules |
| A malformed or non-mint account fed to the decoder | typed, distinct errors; no throw crosses the public surface | `decode-inspect.test.ts` wrong-owner, not-a-mint, account-not-found |
| One bad address blinding a portfolio scan | a per-address fetch or decode failure becomes an error verdict; the batch still triages the rest | `inspect-many.test.ts` |
| An upgradeable transfer hook, audited today and swapped for a sell-blocker tomorrow | second hop: read the hook program's ProgramData header and report immutable vs upgradeable, naming the upgrade authority; an upgradeable hook is a CEX blocker | `hook-program.test.ts` (byte decoders), `hook-enrich.test.ts` (BNDRG's live WNS hook is upgradeable) |
| A claim that the inspector decodes a live mint | a gated CI smoke test fetches a real mainnet mint and asserts the verdict | `live-smoke.test.ts` (CI, `LIVE_RPC=1`) |

The risk thresholds and the conditional-severity model are grounded in real
integrator behavior (Jupiter excludes transfer-fee tokens from resting orders;
Neodyme's two mandatory transfer-hook checks) and in the Token-2022 program source
(the `InvalidExtensionCombination` arms, the two-epoch fee activation rule). See
[skill/transfer-hook-security.md](skill/transfer-hook-security.md) and
[skill/compatibility-matrix.md](skill/compatibility-matrix.md) for the sources.
