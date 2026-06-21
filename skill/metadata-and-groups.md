# Metadata and groups: metadata pointer, token metadata, group and member

Token-2022 can store metadata and collection-style relationships on the mint itself, without a separate metadata program.

## Metadata Pointer
Points to where the token's metadata lives. It can point to the mint itself (self-pointing, most common) or to a separate account.
- Initialize before `InitializeMint`: `createInitializeMetadataPointerInstruction(mint, authority, metadataAddress, TOKEN_2022_PROGRAM_ID)`. For self-pointing, metadataAddress equals the mint.

## Token Metadata
The on-chain name, symbol, uri, and arbitrary additional fields, stored through the metadata interface. It is variable length, so it is initialized after `InitializeMint`.
- Initialize: `createInitializeInstruction({ programId, metadata, updateAuthority, mint, mintAuthority, name, symbol, uri })`.
- Add or change a field: `createUpdateFieldInstruction({ programId, metadata, updateAuthority, field, value })`.
- Read offline: `getExtensionData(ExtensionType.TokenMetadata, mint.tlvData)` then `unpack(...)` from `@solana/spl-token-metadata`.

### Account sizing (the common foot-gun)
`getMintLen` counts the Metadata Pointer but not the Token Metadata. Fund rent for `getMintLen([..., MetadataPointer]) + TYPE_SIZE + LENGTH_SIZE + pack(metadata).length`. Underfunding fails the realloc. See [compatibility-matrix.md](compatibility-matrix.md).

## Group and Member (collections on-chain)
- Group Pointer plus Token Group: marks a mint as a collection with a `maxSize`.
- Group Member Pointer plus Token Group Member: marks a mint as a member of a group.
This is the Token-2022 way to express a collection without an external program.

## Versus Metaplex
On-chain Token Metadata covers name, symbol, uri, and custom fields. Metaplex offers a wider standard (collections, royalty tooling, editions). Choose Token Metadata for a self-contained mint, Metaplex for its ecosystem features.

Working code: `examples/ts-multi-extension-mint` sets a metadata pointer, initializes metadata, adds a custom field, and reads it back offline.

Sources: metadata pointer guide (https://solana.com/developers/guides/token-extensions/metadata-pointer), SPL Token-2022 extensions reference (https://www.solana-program.com/docs/token-2022/extensions).
