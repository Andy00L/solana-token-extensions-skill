# Client code patterns (TypeScript and Rust)

How to read and build Token-2022 mints from clients with the current libraries. For program-side code, delegate to the solana-dev skill.

## TypeScript
Two lines coexist in 2026:
- `@solana/web3.js` v1 with `@solana/spl-token` 0.4.x: the mature path with full Token-2022 instruction builders and unpack helpers. The tested example uses this line.
- `@solana/kit` (the renamed web3.js 2.x) with `@solana-program/token-2022`: the newer path. Prefer it for new client apps that already use kit.

### Build instructions, not blind bytes
- Size accounts with `getMintLen([...extensionTypes])`, plus the metadata length for Token Metadata. Never guess.
- Pass `TOKEN_2022_PROGRAM_ID` to every instruction builder and to `getAssociatedTokenAddressSync`. A Token-2022 ATA differs from an SPL Token ATA for the same owner and mint.

### Read state by unpacking
Token-2022 stores extensions as TLV data after the base account. Read with the typed helpers:
- `unpackMint(address, accountInfo, TOKEN_2022_PROGRAM_ID)` then `getExtensionTypes(mint.tlvData)`, `getTransferFeeConfig(mint)`, `getInterestBearingMintConfigState(mint)`.
- `unpackAccount(address, accountInfo, TOKEN_2022_PROGRAM_ID)` then `getTransferFeeAmount(account)`.
- For metadata, `getExtensionData(ExtensionType.TokenMetadata, mint.tlvData)` then `unpack(...)` from `@solana/spl-token-metadata`.
When account bytes come from a source that returns a Uint8Array (for example LiteSVM), convert to a Buffer before unpacking.

### Errors as values
Return a discriminated result from builders rather than throwing. A test runner such as LiteSVM returns `TransactionMetadata | FailedTransactionMetadata`; branch on it. See `examples/ts-multi-extension-mint`.

## Rust
- Prefer anchor-spl `token_interface` (`Mint`, `TokenAccount`, `TokenInterface`) so a program accepts both SPL Token and Token-2022 mints.
- Size mint accounts with `ExtensionType::try_calculate_account_len`.
- For a transfer hook, use `spl-transfer-hook-interface` and `spl-tlv-account-resolution`. See `examples/transfer-hook-allowlist`.

Sources: @solana/spl-token (https://www.npmjs.com/package/@solana/spl-token), @solana/kit (https://github.com/anza-xyz/kit), SPL Token-2022 extensions reference (https://www.solana-program.com/docs/token-2022/extensions).
