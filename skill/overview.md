# Token-2022 vs SPL Token: when to use which

Token-2022 (also called Token Extensions) is a separate program from the original SPL Token program. It is a superset: it does everything SPL Token does, plus optional extensions configured per mint or per token account. A mint created under one program cannot be used by the other, so the choice is made once, at mint creation.

This file is the decision guide. For a specific extension, follow the routing table in SKILL.md. For core Solana concepts (accounts, PDAs, transactions), use the solana-dev skill.

## Program ids
- SPL Token: `TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA`
- Token-2022: `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`

Always pass the correct program id to instruction builders and to associated-token-account derivation. The associated token account address depends on the token program id, so an SPL Token ATA and a Token-2022 ATA for the same owner and mint are different addresses.

## Choose Token-2022 when you need any of these
- A fee on every transfer (Transfer Fee).
- Custom logic on every transfer, for example an allowlist or a royalty (Transfer Hook).
- On-chain metadata without a separate metadata program (Metadata Pointer plus Token Metadata).
- A soulbound token that cannot be transferred (Non-Transferable).
- A balance that grows with a stated rate for display (Interest-Bearing), or a rebasing display multiplier (Scaled UI Amount).
- A clawback or compliance authority that can move tokens (Permanent Delegate).
- Accounts frozen by default for allowlist or KYC gating (Default Account State).
- A global pause switch (Pausable).

## Prefer plain SPL Token when
- You need the widest wallet, DEX, and exchange support with no integration caveats.
- The token is a simple fungible token with no extension requirement.
- You depend on a venue that does not yet accept Token-2022 deposits (check [integration-compatibility.md](integration-compatibility.md)).

## Costs and caveats of Token-2022
- Larger accounts. Extensions add bytes to the mint and sometimes to each token account, which raises the rent-exempt minimum. Size accounts exactly (see [client-codegen.md](client-codegen.md)).
- Integration gaps. Some wallets and venues handle only a subset of extensions. A transfer hook or confidential transfer can block a listing. Confirm support before launch.
- Irreversible choices. The extension set and several authorities are fixed at creation. There is no in-place upgrade from SPL Token to Token-2022; migration means a new mint (see [migration.md](migration.md)).

## Map a requirement to an extension

| Requirement | Extension | File |
|-------------|-----------|------|
| Fee on transfer | Transfer Fee | transfer-fee.md |
| Custom transfer logic, allowlist, royalty | Transfer Hook | transfer-hook.md |
| On-chain name, symbol, uri | Metadata Pointer + Token Metadata | metadata-and-groups.md |
| Collection or grouping on-chain | Group and Member Pointer | metadata-and-groups.md |
| Cannot be transferred | Non-Transferable | supply-controls.md |
| Display yield | Interest-Bearing | value-extensions.md |
| Rebasing display | Scaled UI Amount | value-extensions.md |
| Compliance clawback | Permanent Delegate | supply-controls.md |
| Frozen by default | Default Account State | supply-controls.md |
| Global pause | Pausable | supply-controls.md |
| Require a memo on receive | Required Memo | account-extensions.md |
| Reclaim mint rent | Mint Close Authority | supply-controls.md |

Sources: Solana Token Extensions docs (https://solana.com/docs/tokens/extensions), SPL Token-2022 program docs (https://www.solana-program.com/docs/token-2022).
