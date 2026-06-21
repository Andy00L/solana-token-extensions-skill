---
description: "Scaffold a Token-2022 mint with a chosen extension set: validate the set, size the account, order the init, and emit runnable code."
---

# /scaffold-mint

Scaffold a Token-2022 mint for the requested extensions.

Input: a list of extensions (for example transfer-fee, metadata, interest-bearing) in `$ARGUMENTS`.

Steps:
1. Validate the extension set against [compatibility-matrix.md](../skill/compatibility-matrix.md). Stop and report if any pair conflicts.
2. Determine the initialization order: fixed extensions before InitializeMint, Token Metadata after.
3. Compute account size with `getMintLen` plus the metadata length, and the rent.
4. Emit a runnable builder (TypeScript by default) that creates the mint and reads it back, following `examples/ts-multi-extension-mint`.
5. Emit a LiteSVM test that asserts the extensions are present.
6. Print the build and test commands.
