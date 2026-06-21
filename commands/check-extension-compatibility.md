---
description: "Validate a Token-2022 extension set: report conflicts, required init order, mint-vs-account placement, and integration caveats."
---

# /check-extension-compatibility

Check whether an extension set is valid and how to order it.

Input: a list of extensions in `$ARGUMENTS`.

Steps:
1. Look up each pair in [compatibility-matrix.md](../skill/compatibility-matrix.md).
2. Report mutually exclusive or pointless pairs and stop if any is fatal.
3. State the required initialization order and which extensions are mint-level versus account-level.
4. Note integration caveats (transfer hook, permanent delegate, pausable, confidential).
5. Output a short go or no-go with the corrected set if needed.
