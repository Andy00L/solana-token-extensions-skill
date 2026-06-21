# Testing extension behavior

Test what the extensions actually do, offline and deterministic. For base harness setup, see the solana-dev skill's testing guide.

## Use LiteSVM
LiteSVM runs a real SVM with the SPL Token and Token-2022 programs bundled, so token tests run with no validator and no devnet. It returns a failed transaction as a value (`FailedTransactionMetadata`), which fits an errors-as-values client.
- `solana-bankrun` is deprecated; use LiteSVM instead.
- For Rust unit tests of a program, Mollusk is a good fit.

## What to assert
- The mint carries the expected extensions: `getExtensionTypes(mint.tlvData)`.
- Transfer fee: the destination receives amount minus fee, the withheld amount equals the fee, and a withdraw sweeps it.
- Metadata: name, symbol, uri, and any custom field read back correctly.
- Interest-bearing: the config rate reads back, and the UI amount grows over time (advance the clock to test it).
- Negative cases: an out-of-order initialization or an incompatible set is rejected. Assert the failed-transaction value, not an exception.

## Determinism
- Generate payers in memory and airdrop with the test runner. Never log a keypair.
- Avoid devnet for behavior tests. Keep them offline so they pass in CI without network.

Working code: `examples/ts-multi-extension-mint` shows positive and negative assertions on LiteSVM.

Sources: LiteSVM (https://www.npmjs.com/package/litesvm), Mollusk (https://github.com/anza-xyz/mollusk).
