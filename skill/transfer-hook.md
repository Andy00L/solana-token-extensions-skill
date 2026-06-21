# Transfer hook and ExtraAccountMetaList

The Transfer Hook extension calls a program of your choice on every transfer. Use it for allowlists, royalties, or per-transfer checks. Read [transfer-hook-security.md](transfer-hook-security.md) before deploying one.

## How it works
1. The mint stores the hook program id (Transfer Hook extension).
2. Each transfer makes a CPI into the hook program's `Execute` instruction.
3. The hook needs extra accounts. These are declared once in an ExtraAccountMetaList account that the hook program owns, derived from seeds `["extra-account-metas", mint]`.
4. The client resolves those extra accounts before sending a transfer.

## The interface
A hook program implements two instructions from `spl-transfer-hook-interface`:
- `InitializeExtraAccountMetaList`: writes the list of extra accounts (fixed pubkeys, PDAs, or accounts derived from instruction data) using `spl-tlv-account-resolution`.
- `Execute`: runs on each transfer. It receives source, mint, destination, owner, and the resolved extra accounts, all read only.

## Client side
- Build the mint with `createInitializeTransferHookInstruction(mint, authority, hookProgramId, TOKEN_2022_PROGRAM_ID)` before `InitializeMint`.
- Create the ExtraAccountMetaList account before the first transfer.
- For transfers, resolve the extra accounts from the on-chain list so the client passes exactly what the hook expects. A mismatch fails every transfer.

## Use the token interface
Write the hook against the transfer-hook interface, and access mints through anchor-spl `token_interface`, so the same code path serves SPL Token and Token-2022 mints. Delegate Anchor or native program scaffolding to the solana-dev skill.

## Reference
`examples/transfer-hook-allowlist` is a native Rust hook with a fail-closed allowlist and an integration test. The security checklist it follows is in [transfer-hook-security.md](transfer-hook-security.md).

Sources: Transfer Hook guide (https://solana.com/developers/guides/token-extensions/transfer-hook), Transfer Hook interface (https://spl.solana.com/transfer-hook-interface).
