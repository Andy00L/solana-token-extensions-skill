---
description: "Security review of a transfer-hook program and its ExtraAccountMetaList against the Token-2022 hook checklist."
---

# /audit-transfer-hook

Audit a transfer-hook program.

Input: a path to the hook program in `$ARGUMENTS`.

Steps:
1. Read the program in full. Map InitializeExtraAccountMetaList and Execute.
2. Run every item in [transfer-hook-security.md](../skill/transfer-hook-security.md): fail-closed, transferring-flag gate, read-only accounts, mint and account-linkage validation, ExtraAccountMetaList correctness, bounded compute, no reentrancy, self-transfer bypass, upgrade authority.
3. Confirm off-chain account resolution matches the on-chain list.
4. Report findings by severity with a concrete fix for each. Do not approve an unaudited mainnet hook.
