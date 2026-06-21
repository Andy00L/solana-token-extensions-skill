---
globs:
  - "**/*.rs"
exclude:
  - "**/target/**"
---

# Rust rules (Solana programs and Token-2022)

These rules are law for Rust code style in this skill. They override softer guidance elsewhere.

## Error handling
- No `unwrap()` or `expect()` in program or library code. Return a `Result` and a typed program error. `unwrap()` is allowed only inside `#[cfg(test)]`.
- Map every failure to a distinct error variant. Two different failures must not share one message.
- Validate before acting. Check account ownership, signer, and mint linkage at the top of each instruction.

## Arithmetic
- Use checked math for any value that can come from an account or instruction data: `checked_add`, `checked_sub`, `checked_mul`, `checked_div`. Return an overflow error on `None`.
- Do not cast with `as` when a value can be attacker controlled. Use `try_into()` and handle the error.

## Token-2022 specifics
- Prefer the `token_interface` types from `anchor-spl`, or the `spl-token-2022` interface, so code works for both SPL Token and Token-2022 mints. Do not hardcode the SPL Token program id when a mint may be Token-2022.
- Size mint accounts with `ExtensionType::try_calculate_account_len` for the exact extension set. Never guess account length.
- Initialize fixed-length mint extensions before `InitializeMint`, in the same transaction as account creation. Initialize the variable-length Token Metadata extension after `InitializeMint`.
- In a transfer hook, treat all transfer accounts as read only. The Token-2022 CPI strips signer privileges, so never assume the sender signed for the hook.

## Naming and structure
- Functions are verb phrases. Variables state what they hold. No single-letter identifiers.
- Public items carry a doc comment that states intent, not syntax.
- Constants use SCREAMING_SNAKE_CASE with a comment giving the unit and the source.

## Hygiene
- Run `cargo fmt` and `cargo clippy` with warnings denied before declaring done.
- Remove dead code, unused imports, and commented-out blocks on the way through a file.
- Tests are required for each instruction: success path, each failure path, and at least one adversarial input.
