---
globs:
  - "**/*.ts"
---

# TypeScript rules (Solana clients and tests)

These rules are law for TypeScript code style in this skill. They override softer guidance elsewhere.

## Types
- No `any`. No `@ts-ignore`, `@ts-expect-error`, or `as unknown as`. Fix the type, not the checker.
- Unpack mint and account extensions with typed helpers (for example `getTransferFeeConfig`, `getTokenMetadata`). Do not read raw bytes by hand.

## Errors as values
- Business logic returns a discriminated result, for example `{ status: "ok", ... } | { status: "error", reason: ... }`. Callers branch on `status`.
- Do not throw inside builders. A test runner such as LiteSVM returns `TransactionMetadata | FailedTransactionMetadata`; check the variant with `instanceof` rather than try/catch.
- Different failures return different `reason` values, never one generic string.

## Solana client choices
- Default to `@solana/kit` for transactions and codecs, and `@solana/spl-token` for Token-2022 instruction builders. Pin the version in `package.json`. Do not mix two web3 lines in one module without a comment.
- Pass the Token-2022 program id explicitly to instruction builders for Token-2022 mints. Do not rely on the default SPL Token program id.

## Naming and structure
- Functions are verb phrases. Variables state what they hold. No single-letter callback parameters in `map`, `filter`, or `reduce`.
- Booleans read as questions: `isFrozen`, `hasTransferFee`, `shouldHarvest`.
- Constants use SCREAMING_SNAKE_CASE with a comment giving the unit and the source.

## Hygiene
- Every log line carries a `[FunctionName]` prefix. Never log secrets, keypairs, or mnemonics.
- No floating promises. Await or explicitly handle every promise.
- Run the formatter and the test suite before declaring done. Remove dead code on the way through.
