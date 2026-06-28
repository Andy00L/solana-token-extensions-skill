---
name: solana-token-extensions
description: Solana Token-2022 (Token Extensions) mastery. Use when a task involves Token-2022 or Token Extensions: choosing or combining extensions, building or scaffolding a mint, inspecting or auditing a live mint, harvesting transfer fees, or wallet, DEX, and CEX integration. Extends solana-dev-skill with extension-specific guidance: transfer fee, transfer hook and ExtraAccountMetaList, confidential transfer status, metadata pointer and token metadata, group and member pointer, non-transferable, interest-bearing, scaled UI amount, permanent delegate, default account state, immutable owner, CPI guard, required memo, mint close authority, pausable, plus a compatibility matrix, SPL-to-Token-2022 migration, wallet and DEX integration, and transfer-hook security auditing. For core program development (Anchor, Pinocchio, IDL codegen, base testing and security), delegates to core solana-dev skill.
user-invocable: true
---

# Solana Token-2022 (Token Extensions) Skill

> **Extends**: [solana-dev-skill](../solana-dev/SKILL.md). Core Solana development (programs, frontend, testing, security).

Use this skill to choose, build, integrate, and audit Token-2022 mints. It owns the extension layer. It delegates base program work to the core solana-dev skill and never duplicates it.

## What This Skill Is For

### Choose and design extensions
- Decide between SPL Token and Token-2022 for a mint
- Select an extension set for a token (fees, metadata, controls, privacy, yield)
- Check whether extensions can be combined and in what order
- Design a token model that uses extensions (yield, fees, gated transfer, clawback)

### Build with extensions
- Initialize a Token-2022 mint with a chosen extension set, correctly sized and ordered
- Author a Transfer Hook program and its ExtraAccountMetaList
- Set up on-chain token metadata and group or member relationships

### Integrate and operate
- Wallet, DEX, explorer, and exchange compatibility for a given extension set
- Inspect a live mint by address: decode its extensions and flag integration risks ([mint-inspector.md](mint-inspector.md))
- Migrate an existing SPL Token mint to Token-2022
- Generate client code (TypeScript with @solana/kit and @solana/spl-token, Rust with anchor-spl)

### Review and secure
- Audit a transfer-hook program for malicious or unsafe behavior
- Find ExtraAccountMetaList, CPI, and reentrancy problems before mainnet

### Program development (delegate to core skill)
- Anchor programs: [programs-anchor.md](../solana-dev/programs-anchor.md)
- Pinocchio programs: [programs-pinocchio.md](../solana-dev/programs-pinocchio.md)
- IDL and client codegen: [idl-codegen.md](../solana-dev/idl-codegen.md)
- Base program testing: [testing.md](../solana-dev/testing.md)
- Base security checklist: [security.md](../solana-dev/security.md)

## Stack Decisions (June 2026)

1. Program: SPL Token-2022, program id `TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb`. Prefer the anchor-spl `token_interface` so code works for both SPL Token and Token-2022 mints.
2. Client: `@solana/kit` for transactions and codecs, `@solana/spl-token` for extension instruction builders. Unpack mint extensions with the typed helpers, never raw bytes.
3. Testing: LiteSVM and Mollusk for extension behavior (fees withheld, hook invoked, paused transfer rejected). See core [testing.md](../solana-dev/testing.md) for harness setup. `solana-bankrun` is deprecated; do not use it.
4. Privacy: confidential transfers were re-enabled on mainnet on 2026-06-04 (the ZK ElGamal Proof Program is executable again; see [confidential-transfer.md](confidential-transfer.md)). Treat them as live but handle with care: wallet, DEX, and CEX support is narrow and opaque balances invite a compliance review. Verify end to end before relying on them.
5. Defaults: pick the smallest extension set that meets the requirement. Errors as values in client code, no type suppression.

## Operating Procedure

### 1. Classify the task layer

| Layer | Examples | Skill file |
|-------|----------|------------|
| Choose Token-2022 vs SPL | Standard decision | [overview.md](overview.md) |
| Single extension | Fees, hook, metadata, yield | the matching extension file |
| Combine extensions | Conflicts, ordering | [compatibility-matrix.md](compatibility-matrix.md) |
| Migration | SPL to Token-2022 | [migration.md](migration.md) |
| Integration | Wallet, DEX, CEX support | [integration-compatibility.md](integration-compatibility.md) |
| Inspect a live mint | Decode a mint, flag risks | [mint-inspector.md](mint-inspector.md) |
| Client code | TypeScript and Rust builders | [client-codegen.md](client-codegen.md) |
| Hook security | Audit a hook | [transfer-hook-security.md](transfer-hook-security.md) |
| Program or Anchor | On-chain logic | [programs-anchor.md](../solana-dev/programs-anchor.md) |

### 2. Pick the right agent

| Task type | Agent | Model |
|-----------|-------|-------|
| Extension selection and design | token-architect | opus |
| Mint and hook implementation | extensions-engineer | sonnet |
| Hook and config audit | token-2022-auditor | opus |
| Wallet, DEX, migration wiring | integration-engineer | sonnet |

### 3. Apply extension-specific patterns
- Size the mint account for the chosen extension set before `InitializeMint`.
- Initialize fixed-length extension config instructions before `InitializeMint`, in the same transaction as account creation.
- For transfer hooks, create the ExtraAccountMetaList account before the first transfer.
- Validate the set against [compatibility-matrix.md](compatibility-matrix.md). Some pairs are rejected by the runtime.

### 4. Add tests
- LiteSVM or Mollusk: assert withheld fees, hook invocation, paused transfer rejects, non-transferable rejects, interest reflected in the UI amount.
- Two-strike rule: if a test fails twice on the same issue, stop and ask.

### 5. Deliverables
- Exact files changed with clear diffs.
- Package dependencies (Cargo.toml, package.json) with pinned versions.
- Build and test commands.
- Extension order and account-sizing notes.

## Progressive Disclosure (Read When Needed)

### Token-2022 skills (this addon)

Decide and combine:
- [overview.md](overview.md): when Token-2022 beats SPL Token, and when it costs you
- [compatibility-matrix.md](compatibility-matrix.md): mutually exclusive and order-dependent extensions

Extension families:
- [transfer-fee.md](transfer-fee.md): transfer fee config, withheld fees, harvest and withdraw
- [transfer-hook.md](transfer-hook.md): hook interface and ExtraAccountMetaList authoring
- [confidential-transfer.md](confidential-transfer.md): confidential transfer status and the disablement history
- [metadata-and-groups.md](metadata-and-groups.md): metadata pointer, token metadata, group and member
- [value-extensions.md](value-extensions.md): interest-bearing and scaled UI amount
- [supply-controls.md](supply-controls.md): non-transferable, permanent delegate, default account state, mint close, pausable
- [account-extensions.md](account-extensions.md): immutable owner, CPI guard, required memo

Operate and integrate:
- [migration.md](migration.md): SPL Token to Token-2022
- [integration-compatibility.md](integration-compatibility.md): wallet, DEX, explorer, CEX support
- [mint-inspector.md](mint-inspector.md): decode a live mint and assess its integration risk, with a renounce-to-remediate path and batch triage (CLI and five MCP tools)
- [client-codegen.md](client-codegen.md): TypeScript and Rust client patterns
- [testing.md](testing.md): extension behavior tests with LiteSVM and Mollusk

Security:
- [transfer-hook-security.md](transfer-hook-security.md): malicious hooks, ExtraAccountMetaList, CPI

Reference:
- [resources.md](resources.md): curated Token-2022 links with dates

### Core Solana dev skills (from solana-dev-skill)

> These are provided by [solana-dev-skill](../solana-dev/SKILL.md). Install it if not present.

- [programs-anchor.md](../solana-dev/programs-anchor.md): Anchor framework patterns
- [programs-pinocchio.md](../solana-dev/programs-pinocchio.md): Pinocchio high-performance programs
- [idl-codegen.md](../solana-dev/idl-codegen.md): IDL generation and client codegen
- [frontend-framework-kit.md](../solana-dev/frontend-framework-kit.md): React hooks, wallet connection
- [testing.md](../solana-dev/testing.md): LiteSVM, Mollusk, Surfpool
- [security.md](../solana-dev/security.md): security checklist for programs and clients

## Task Routing Guide

| User asks about | Primary skill file |
|-----------------|--------------------|
| SPL Token vs Token-2022 | overview.md |
| Transfer fee on a token | transfer-fee.md |
| Harvest withheld fees | transfer-fee.md |
| Transfer hook program | transfer-hook.md |
| ExtraAccountMetaList | transfer-hook.md, transfer-hook-security.md |
| Confidential transfer | confidential-transfer.md |
| On-chain token metadata | metadata-and-groups.md |
| Metadata pointer | metadata-and-groups.md |
| Token group or member | metadata-and-groups.md |
| Soulbound or non-transferable | supply-controls.md |
| Interest-bearing token | value-extensions.md |
| Scaled UI amount or rebasing display | value-extensions.md |
| Permanent delegate | supply-controls.md |
| Default frozen accounts | supply-controls.md |
| Pausable token | supply-controls.md |
| Immutable owner | account-extensions.md |
| CPI guard | account-extensions.md |
| Required memo on transfer | account-extensions.md |
| Mint close authority | supply-controls.md |
| Which extensions can combine | compatibility-matrix.md |
| Migrate SPL mint to Token-2022 | migration.md |
| Wallet, DEX, or exchange support | integration-compatibility.md |
| Inspect a mint address | mint-inspector.md |
| What extensions does this mint have | mint-inspector.md |
| Is this token safe to integrate or list | mint-inspector.md |
| Generate client code | client-codegen.md |
| Test extension behavior | testing.md |
| Audit a transfer hook | transfer-hook-security.md |
| Web wallet connection | solana-dev -> frontend-framework-kit.md |
| Program testing harness | solana-dev -> testing.md |
| Base security checklist | solana-dev -> security.md |
| **Anchor program** | solana-dev -> programs-anchor.md |
| **Pinocchio program** | solana-dev -> programs-pinocchio.md |
| **IDL or codegen** | solana-dev -> idl-codegen.md |

## Commands

| Command | Description |
|---------|-------------|
| /scaffold-mint | Scaffold a Token-2022 mint with a chosen extension set, sized account, ordered init |
| /check-extension-compatibility | Validate an extension set against the compatibility matrix |
| /inspect-mint | Decode a live mint by address and report wallet, DEX, and CEX integration risks |
| /audit-transfer-hook | Security review of a transfer-hook program and its ExtraAccountMetaList |
| /plan-migration | Plan a migration from an SPL Token mint to Token-2022 |
| /generate-client | Generate TypeScript and Rust client code for a mint's extensions |

## Agents

| Agent | Purpose |
|-------|---------|
| token-architect | Extension selection, token model design, compatibility decisions |
| extensions-engineer | Mint and transfer-hook implementation, client wiring |
| token-2022-auditor | Hook and config security review, ExtraAccountMetaList and CPI checks |
| integration-engineer | Wallet, DEX, and CEX compatibility, migration execution |

## Working Examples

This skill ships tested reference code under `examples/` in the source repository:
- `examples/ts-multi-extension-mint`: a Token-2022 mint that combines transfer fee, metadata pointer, token metadata, and interest-bearing, with LiteSVM tests that run offline.
- `examples/transfer-hook-allowlist`: a native Rust transfer-hook program with a fail-closed allowlist and a LiteSVM integration test.
- `examples/mint-inspector`: the read-only mint inspector behind [mint-inspector.md](mint-inspector.md), a CLI and five MCP tools (`inspect_mint`, `inspect_many`, `check_extension_compatibility`, `scaffold_mint`, `generate_hook_transfer`) with offline tests. See that file for usage.

Run `make verify` in `examples/` to build and test all three.
