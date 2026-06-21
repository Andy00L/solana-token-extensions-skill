---
description: "Generate TypeScript and Rust client code for a mint's extension set, including reads that unpack extension state."
---

# /generate-client

Generate client code for an existing Token-2022 mint.

Input: the mint address or its extension set in `$ARGUMENTS`.

Steps:
1. Identify the extensions on the mint, or take them from input.
2. Generate TypeScript reads with the typed unpack helpers and writes with the extension instruction builders, passing the Token-2022 program id.
3. Generate Rust reads using anchor-spl token_interface where a program needs them.
4. Return errors as values. Include one read test on LiteSVM.
5. See [client-codegen.md](../skill/client-codegen.md).
