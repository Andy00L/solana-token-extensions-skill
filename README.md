# Solana Token-2022 (Token Extensions) Skill

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Solana](https://img.shields.io/badge/Solana-Token--2022-9945FF)
![Agent skill](https://img.shields.io/badge/Claude_Code%20%2F%20Codex-skill-orange)
![Tests](https://img.shields.io/badge/tests-31%20passing-brightgreen)
![Build](https://img.shields.io/badge/cargo%20build--sbf-passing-brightgreen)
![Stack](https://img.shields.io/badge/stack-January%202026-blue)

A progressively loaded Claude Code and Codex skill that makes a coding agent an expert in **SPL Token-2022 (Token Extensions)**: choosing and combining extensions, building mints and transfer hooks, migrating from SPL Token, integrating with wallets and DEXs, and auditing transfer-hook security. It is built to slot into the [Solana AI Kit](https://github.com/solanabr/solana-ai-kit) next to `solana-dev-skill`, which it delegates core program work to instead of duplicating it.

Token-2022 is the 2026 standard for serious tokens (stablecoins, real-world assets, regulated tokens), and its extension surface is where builders trip: init ordering, account sizing, incompatible pairs, and transfer-hook security. No existing kit skill consolidates this. This one does, and ships tested reference code to prove it.

## How the skill routes (progressive loading)

```mermaid
flowchart TD
    U([User request]) --> R{SKILL.md router}
    R -->|choose and combine| C["overview<br/>compatibility-matrix"]
    R -->|build extensions| B["transfer-fee<br/>transfer-hook<br/>metadata-and-groups<br/>value-extensions<br/>supply-controls<br/>account-extensions"]
    R -->|operate and integrate| O["migration<br/>integration-compatibility<br/>mint-inspector<br/>client-codegen<br/>testing"]
    R -->|security| S["transfer-hook-security<br/>confidential-transfer"]
    R -->|core program dev| CORE[["solana-dev-skill<br/>Anchor, Pinocchio, IDL"]]
    R --> AG[["4 agents<br/>architect, engineer,<br/>auditor, integration"]]
    R --> CMD[["5 commands<br/>scaffold-mint, check-compat,<br/>audit-hook, plan-migration,<br/>gen-client"]]
    B -.proven by.-> EX["examples/<br/>TS mint + Rust hook + inspector<br/>make verify: 31 tests green"]
    S -.proven by.-> EX
    O -.tool.-> EX
```

The agent reads `SKILL.md` first, then loads only the focused file a task needs. Tokens are spent on the topic at hand, not the whole skill.

## Why this skill

- **Useful**: covers the full Token-2022 extension surface that builders hit every day, with the init-order and account-sizing gotchas that cause silent failures. It also ships a read-only **mint inspector** (CLI and MCP) that decodes any mint and flags wallet, DEX, and CEX risks, for due diligence without writing code.
- **Novel**: three documents nobody else ships as a skill: a real **extension compatibility matrix**, a **transfer-hook security audit checklist**, and an accurate **confidential-transfer status** (disabled on mainnet since June 2025, tracking issue [token-2022#657](https://github.com/solana-program/token-2022/issues/657), still open). A lower-effort skill would show confidential-transfer code as live; this one does not. The matrix and the integration rules are not just prose: the mint inspector turns them into an executable risk engine.
- **Tested**: three reference builds run offline and deterministic. A TypeScript multi-extension mint on LiteSVM (8 tests), a native Rust transfer-hook program (`cargo build-sbf` plus 8 unit tests), and the mint inspector (15 tests). One inaccuracy was found and corrected by actually running the code (see the compatibility matrix note on Non-Transferable plus Transfer Hook).
- **Fits**: mirrors the reference `solana-game-skill` shape exactly (skill router, focused docs, agents, commands, rules, installer), so it can be submoduled into the kit. The inspector also exposes an MCP `inspect_mint` tool an agent can call directly.

## What's included

### Token-2022 knowledge (this addon)

Decide and combine: `overview.md`, `compatibility-matrix.md`.
Extension families: `transfer-fee.md`, `transfer-hook.md`, `metadata-and-groups.md`, `value-extensions.md`, `supply-controls.md`, `account-extensions.md`.
Operate and integrate: `migration.md`, `integration-compatibility.md`, `mint-inspector.md`, `client-codegen.md`, `testing.md`.
Security: `transfer-hook-security.md`, `confidential-transfer.md`.
Reference: `resources.md`.

### Tools

`mint-inspector.md` documents a read-only inspector that decodes a live mint's extensions and reports its wallet, DEX, and CEX integration risks. It ships as a CLI and an MCP `inspect_mint` tool in `examples/mint-inspector`, with offline tests.

### Core (delegated to solana-dev-skill)

Program development (Anchor, Pinocchio), IDL and client codegen, base testing harness, and the base security checklist come from `solana-dev-skill`. This skill links to them and never duplicates them.

## Install

The installer copies `skill/*` into `~/.claude/skills/solana-token-extensions/`. By default it also registers the four agents into `~/.claude/agents/` and the five commands into `~/.claude/commands/`, so they work standalone as live subagents and slash commands. It does **not** modify your global `~/.claude/CLAUDE.md`, and it never overwrites an existing agent or command (a same-named file is skipped with a notice).

```bash
# Standard: skill plus agents and commands
./install.sh -y

# Skill only, no agents or commands
./install.sh -y --skill-only

# Interactive: choose the skills directory and what to register
./install-custom.sh
```

Repo-relative links inside the copied agents and commands are rewritten to the installed absolute paths, so they resolve outside the repo. If `solana-dev-skill` is not already installed, the installer offers to clone it (this skill delegates core program work to it).

## Default stack (January 2026)

- Program: `spl-token-2022`, accessed through anchor-spl `token_interface` so code serves both SPL Token and Token-2022 mints.
- Client: `@solana/kit` for transactions and codecs, `@solana/spl-token` for extension instruction builders.
- Tests: LiteSVM for offline extension behavior. `solana-bankrun` is deprecated and not used.
- Confidential transfers: disabled on mainnet as of June 2026. Not presented as production ready.

## Tested reference code

All three examples run offline with no validator and no devnet.

```bash
cd examples
make verify     # builds the Rust hook, then runs the TS, inspector, and Rust suites
```

What passes:

- `examples/ts-multi-extension-mint`: builds one mint combining transfer fee, metadata pointer, token metadata, and interest-bearing, then asserts the four extensions are present, the fee is withheld on receive and withdrawable, and the metadata reads back. Further tests assert that an out-of-order initialization is rejected and that the fee is capped and floored correctly. **8 tests, LiteSVM, offline.**
- `examples/transfer-hook-allowlist`: a native Rust transfer hook with a fail-closed allowlist, the transferring-flag gate, per-destination PDA validation, and an `AddToAllowlist` instruction gated on the mint authority. `cargo build-sbf` produces a deployable program and `cargo test` runs **8 unit tests**.
- End to end: the `transfer-hook-e2e` test loads the compiled hook, creates a Token-2022 mint that uses it, and proves a real transfer is **blocked** when the destination is not allowlisted and **allowed** after `AddToAllowlist`.
- `examples/mint-inspector`: the read-only mint inspector (CLI and MCP). The risk engine is tested as pure functions, the decoder against real Token-2022 mints built in LiteSVM, and the MCP handler with an injected fetcher. **15 tests, offline.** See [examples/mint-inspector/README.md](examples/mint-inspector/README.md).

A captured run is committed at `examples/VERIFICATION_OUTPUT.txt`.

## Verified facts (checked June 2026)

| Component | Pinned | Source |
|---|---|---|
| `@solana/spl-token` | 0.4.14 | npmjs.com/package/@solana/spl-token |
| `@solana/spl-token-metadata` | 0.1.6 | npm |
| `@solana/web3.js` | 1.98.4 | npm |
| `litesvm` (JS) | 0.6.0 | npmjs.com/package/litesvm |
| `spl-token-2022` (Rust) | 11.0.0 | docs.rs/spl-token-2022 |
| `spl-transfer-hook-interface` | 2.1.0 | docs.rs/spl-transfer-hook-interface |
| `spl-tlv-account-resolution` | 0.11.1 | docs.rs/spl-tlv-account-resolution |
| Toolchain | solana-cli 3.1.9, cargo-build-sbf 3.1.9, Node 22 | local |
| Confidential transfers | disabled on mainnet | github.com/solana-program/token-2022/issues/657 |

## Agents

| Agent | Purpose |
|---|---|
| `token-architect` | Extension selection, token model, compatibility and init order |
| `extensions-engineer` | Mint and transfer-hook implementation, client wiring |
| `token-2022-auditor` | Hook and config security review, ExtraAccountMetaList and CPI checks |
| `integration-engineer` | Wallet, DEX, and CEX compatibility, migration execution |

## Commands

| Command | Description |
|---|---|
| `/scaffold-mint` | Scaffold a Token-2022 mint with a chosen extension set, sized and ordered |
| `/check-extension-compatibility` | Validate an extension set against the compatibility matrix |
| `/inspect-mint` | Decode a live mint by address and report wallet, DEX, and CEX integration risks |
| `/audit-transfer-hook` | Security review of a transfer-hook program and its ExtraAccountMetaList |
| `/plan-migration` | Plan an SPL Token to Token-2022 migration |
| `/generate-client` | Generate TypeScript and Rust client code for a mint's extensions |

## Repository structure

```
solana-token-extensions-skill/
├── skill/                     SKILL.md router + 16 focused docs (+ solana-dev-skill submodule)
├── agents/                    4 specialized agents
├── commands/                  6 workflow commands
├── rules/                     rust.md, typescript.md (code style law)
├── examples/
│   ├── ts-multi-extension-mint/    TypeScript mint + LiteSVM tests
│   ├── transfer-hook-allowlist/    native Rust hook + unit tests
│   ├── mint-inspector/             read-only mint inspector (CLI + MCP) + offline tests
│   ├── Makefile                    make verify
│   └── VERIFICATION_OUTPUT.txt     committed run transcript
├── CLAUDE.md                  skill agent configuration
├── install.sh / install-custom.sh
└── LICENSE                    MIT
```

This repo vendors `solana-dev-skill` as a git submodule under `skill/solana-dev-skill` (the delegated core docs), matching the reference layout. Clone with `git clone --recurse-submodules`, or run `git submodule update --init` after a plain clone.

## Add to the Solana AI Kit (optional)

To wire this skill into a local `solana-ai-kit` checkout the same way the other skills are registered:

```bash
git submodule add https://github.com/Andy00L/solana-token-extensions-skill \
  .claude/skills/ext/solana-token-extensions
```

Then add a routing block for it in the kit's `.claude/skills/SKILL.md` hub, and a catalog entry in `.claude/skills/skill-registry.json`. See [KIT_INTEGRATION.md](KIT_INTEGRATION.md) for the exact registry entry, hub routing rows, and the fork-and-PR steps.

## Contributing

Issues and pull requests are welcome. Keep the standards the repo already follows: focused, token-efficient docs that cite a primary source for any non-obvious claim, errors as values with no type suppression in code, and tests that run offline.

## License

MIT. See [LICENSE](LICENSE).
