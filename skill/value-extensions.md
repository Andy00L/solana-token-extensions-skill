# Value display extensions: interest-bearing and scaled UI amount

Both change the displayed amount of a token without changing the stored base-unit balance. They affect the UI amount only. Do not use them for settlement math; settle on raw base units.

## Interest-Bearing
Stores a continuously compounding rate in basis points. The raw balance never changes; the UI amount grows with elapsed time.
- Initialize with `createInitializeInterestBearingMintInstruction(mint, rateAuthority, rateBasisPoints, TOKEN_2022_PROGRAM_ID)`.
- Read with `getInterestBearingMintConfigState(mint)` (returns `currentRate` and timestamps).
- Convert offline with `amountToUiAmountForInterestBearingMintWithoutSimulation(amount, decimals, currentTimestamp, lastUpdateTimestamp, initializationTimestamp, preUpdateAverageRate, currentRate)`.
- The rate authority can update the rate. Set it to null to lock it.

## Scaled UI Amount
Applies a fixed multiplier to the displayed amount (rebasing display). Distinct from interest-bearing: it is a set multiplier, not a time-based accrual.
- Convert offline with `amountToUiAmountForScaledUiAmountMintWithoutSimulation(amount, decimals, multiplier)`.

## Do not combine them
Both rescale the UI amount. Combining interest-bearing and scaled UI amount on one mint is confusing and is not recommended. Pick one.

## Integrator notes
- Wallets and explorers must use the UI amount helpers to show correct balances, or they will display the raw amount.
- Never compute fees, swaps, or settlement on the UI amount. Use the raw base-unit balance.

Working code: `examples/ts-multi-extension-mint` initializes and reads an interest-bearing config.

Sources: SPL Token-2022 extensions reference (https://www.solana-program.com/docs/token-2022/extensions), scaled UI amount guide (https://solana.com/docs/tokens/extensions/scaled-ui-amount).
