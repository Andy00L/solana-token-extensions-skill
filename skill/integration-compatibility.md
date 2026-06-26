# Integration compatibility: wallets, DEXs, explorers, exchanges

Token-2022 support varies by surface and by extension. Confirm support before launch, especially for transfer hooks and confidential transfers.

## What to check per surface
- Wallets (Phantom, Solflare, Backpack): do they display Token-2022 balances and metadata, and can they sign transfers for a mint with your extensions, including resolving a transfer hook's extra accounts?
- DEXs and routers: do they route a mint with a transfer fee (fee taken from the received amount) or a transfer hook (extra accounts on every swap)? Many AMMs need explicit Token-2022 support.
- Explorers: do they show the extensions and the on-chain metadata?
- Centralized exchanges: deposit and withdrawal support is the strictest. A transfer hook, a permanent delegate, or a pause authority often blocks a listing because the venue cannot accept that trust model.

## Extensions that most often cause friction
- Transfer Hook: every transfer needs extra accounts and a CPI. Integrators must resolve and simulate it. Some venues reject hooks outright.
- Confidential Transfer: narrow support, and disabled on mainnet as of mid-2026, re-enablement pending (see [confidential-transfer.md](confidential-transfer.md)).
- Permanent Delegate and Pausable: a trust and operational concern for custodians and exchanges while their authority is live.
- Transfer Fee: integrators must use the net received amount and cannot close accounts that still hold withheld fees.

## Authority liveness: the live authority is the risk, not the extension

Most fund-loss-grade extensions are hazardous only while their controlling authority is live. A renounced (null) authority makes the power dormant, so triage on liveness, not mere presence:

- Permanent delegate: a live delegate can seize or burn any balance and survives a renounced mint and freeze authority and locked liquidity. Renounced, it is inert. This is the marquee fund-loss case.
- Transfer fee: a live fee-config authority can raise the rate (subject to a roughly two-epoch activation delay and the maximum-fee cap). Jupiter excludes transfer-fee Token-2022 tokens from Limit and Recurring orders for exactly this reason (a resting order could fill at a changed rate) while still allowing Instant swaps. A renounced fee-config authority locks the rate.
- Freeze authority: a live freeze authority can freeze any account until it is thawed; a renounced one cannot.
- Pausable: a live pause authority can halt all transfers, mints, and burns; renounced, it cannot.
- Mint authority: live means supply is not fixed; renounced means a fixed supply.

The mint inspector encodes this as conditional severity: a renounced authority downgrades the finding and clears a CEX listing block. Score the live set, not the nominal extension list.

## Practical guidance
- Pick the smallest extension set that meets your requirement, to widen support.
- Before mainnet, test deposits and trades on each venue you care about.
- Document your extension set and authorities so integrators can assess it quickly.

Sources: SPL Token-2022 extensions reference (https://www.solana-program.com/docs/token-2022/extensions), Neodyme Token-2022 security review (https://neodyme.io/en/blog/token-2022/), Jupiter transfer-tax token support (https://docs.jup.ag/user-docs/manage/mobile/faq), Solana transfer-fee guide (https://solana.com/developers/guides/token-extensions/transfer-fee).
