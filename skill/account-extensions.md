# Account extensions: immutable owner, CPI guard, required memo

These extensions apply to token accounts, not the mint. They harden how an account can be used.

## Immutable Owner
Prevents changing a token account's owner. The associated token account program sets this by default for Token-2022 ATAs, which stops an ownership-transfer rug on an ATA. You rarely set it by hand; it is implied for ATAs.

## CPI Guard
When enabled on a token account, it blocks certain actions during a cross-program invocation, for example transferring to an owner other than the account owner, or approving a delegate. It protects a user from a malicious program draining the account during a CPI. The account owner enables or disables it.

## Required Memo on Transfer (MemoTransfer)
When enabled on a token account, incoming transfers must be accompanied by a memo instruction. Useful for compliance and for exchanges that require a memo. The account owner enables or disables it.

## Notes
- These are opt-in per account, except Immutable Owner, which ATAs set by default.
- Required memo can break senders that do not attach a memo. Document it for integrators.

Sources: SPL Token-2022 extensions reference (https://www.solana-program.com/docs/token-2022/extensions).
