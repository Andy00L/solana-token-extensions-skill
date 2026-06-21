# Migrating from SPL Token to Token-2022

There is no in-place upgrade. SPL Token and Token-2022 are different programs, and a mint cannot switch between them. Migration means creating a new Token-2022 mint and moving holders to it.

## Plan
1. Create the new Token-2022 mint with the extension set you need. Lock the authorities you do not want mutable.
2. Choose a distribution method:
   - Airdrop: snapshot holders of the old mint, then mint the new token to them. Simplest for a fixed holder set.
   - Swap program: holders burn or lock the old token and receive the new one. Best for open, ongoing migration.
   - Wrap: a vault holds the old token and issues the new one, redeemable back. Keeps a peg, but adds a contract to trust.
3. Migrate liquidity: create new pools for the Token-2022 mint, seed liquidity, and move incentives off the old pools. Plan for a window where both exist.
4. Handle the holder list: communicate the deadline, support both tokens during the window, and provide a clear redemption path.
5. Rollback plan: if the new mint has a problem, holders must still hold value. A swap or wrap with a redemption path preserves this better than a one-way airdrop.

## Cautions
- Extension choices on the new mint are mostly permanent. Decide the authority model before launch.
- Wallets, DEXs, and exchanges must support the new mint's extensions. Confirm before migrating liquidity (see [integration-compatibility.md](integration-compatibility.md)).
- A transfer fee or hook on the new mint can break a naive one-for-one swap. Account for the fee in swap math.

Sources: [overview.md](overview.md), SPL Token-2022 program docs (https://www.solana-program.com/docs/token-2022).
