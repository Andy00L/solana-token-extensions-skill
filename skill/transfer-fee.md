# Transfer fee

The Transfer Fee extension takes a fee on every transfer. The fee is withheld on the recipient's token account, not sent to the sender or a treasury directly. A withdraw authority harvests withheld fees later.

## Configure at mint creation
Initialize the config before `InitializeMint`, in the same transaction as account creation (see [compatibility-matrix.md](compatibility-matrix.md)).
- transferFeeBasisPoints: fee in basis points (100 = 1%), capped at 10000 (100%).
- maximumFee: an absolute cap in base units, so large transfers are not overcharged.
- transferFeeConfigAuthority: can change the fee. Set to null to lock it.
- withdrawWithheldAuthority: can harvest withheld fees. Set to null to lock it.

TypeScript: `createInitializeTransferFeeConfigInstruction(mint, configAuthority, withdrawAuthority, basisPoints, maximumFee, TOKEN_2022_PROGRAM_ID)`.

## Transfer with the fee
Use the checked-fee path so the client states the expected fee and the program asserts it:
`createTransferCheckedWithFeeInstruction(source, mint, destination, owner, amount, decimals, fee, [], TOKEN_2022_PROGRAM_ID)`.
The fee equals `floor(amount * basisPoints / 10000)`, capped at maximumFee. A mismatch makes the transfer fail.

## Read withheld fees
- On a token account, `getTransferFeeAmount(account)` returns the `withheldAmount`.
- On the mint, `getTransferFeeConfig(mint)` returns `newerTransferFee` and `olderTransferFee`. The config supports a future-dated fee change keyed by epoch, which is why there are two.

## Harvest and withdraw
- `createWithdrawWithheldTokensFromAccountsInstruction(mint, destination, withdrawAuthority, [], sourceAccounts, TOKEN_2022_PROGRAM_ID)` moves withheld fees from listed accounts into a destination account.
- `createHarvestWithheldTokensToMintInstruction` sweeps withheld fees from accounts back to the mint, which the withdraw authority can then withdraw. Use this before closing accounts.

## Integrator notes
- The recipient receives amount minus fee. Escrows and routers must use the net amount, not the gross.
- An account cannot be closed while it holds withheld fees. Harvest first.

Working code: `examples/ts-multi-extension-mint` exercises fee withholding and withdrawal in an offline test.

Sources: Solana transfer fees guide (https://solana.com/docs/tokens/extensions/transfer-fees).
