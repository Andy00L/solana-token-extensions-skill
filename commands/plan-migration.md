---
description: "Produce a phased plan to migrate an SPL Token mint to Token-2022, with distribution, liquidity, and rollback."
---

# /plan-migration

Plan an SPL-to-Token-2022 migration.

Input: the existing mint and the target extension set in `$ARGUMENTS`.

Steps:
1. Confirm there is no in-place upgrade, then define the new Token-2022 mint and its authorities.
2. Choose a distribution method (airdrop, swap, or wrap) and justify it for this holder set.
3. Plan liquidity migration and the dual-token window.
4. Define holder communication and the redemption path.
5. Define a rollback plan that preserves holder value.
6. List the integration checks required before moving liquidity. See [migration.md](../skill/migration.md).
