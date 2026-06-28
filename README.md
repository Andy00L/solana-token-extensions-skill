# Solana Token-2022 (Token Extensions) Skill

![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Solana](https://img.shields.io/badge/Solana-Token--2022-9945FF)
![Agent skill](https://img.shields.io/badge/Claude_Code%20%2F%20Codex-skill-orange)
![Tests](https://img.shields.io/badge/tests-111%20passing-brightgreen)
![Build](https://img.shields.io/badge/cargo%20build--sbf-passing-brightgreen)
[![CI](https://github.com/Andy00L/solana-token-extensions-skill/actions/workflows/verify.yml/badge.svg)](https://github.com/Andy00L/solana-token-extensions-skill/actions/workflows/verify.yml)
![Stack](https://img.shields.io/badge/stack-January%202026-blue)

A progressively loaded Claude Code and Codex skill that makes a coding agent an expert in **SPL Token-2022 (Token Extensions)**: choosing and combining extensions, building mints and transfer hooks, migrating from SPL Token, integrating with wallets and DEXs, and auditing transfer-hook security. It is built to slot into the [Solana AI Kit](https://github.com/solanabr/solana-ai-kit) next to `solana-dev-skill`, which it delegates core program work to instead of duplicating it.

Token-2022 is the 2026 standard for serious tokens (stablecoins, real-world assets, regulated tokens), and its extension surface is where builders trip: init ordering, account sizing, incompatible pairs, and transfer-hook security. No existing kit skill consolidates this. This one does, and ships tested reference code to prove it.

The mint inspector decoding the PayPal USD (PYUSD) mint: a CRITICAL verdict driven by the live permanent delegate, with conditional severity, a 0-to-100 risk score, and a per-finding fix, plus the confidential transfer fee that the published `@solana/spl-token` enum does not name:

![The mint inspector decoding the PYUSD mint](examples/mint-inspector/demo.gif)

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
    R --> CMD[["6 commands<br/>scaffold-mint, check-compat,<br/>inspect-mint, audit-hook,<br/>plan-migration, gen-client"]]
    B -.proven by.-> EX["examples/<br/>TS mint + Rust hook + inspector<br/>make verify: 111 checks green"]
    S -.proven by.-> EX
    O -.tool.-> EX
```

The agent reads `SKILL.md` first, then loads only the focused file a task needs. Tokens are spent on the topic at hand, not the whole skill.

## Why this skill

- **Useful**: covers the full Token-2022 extension surface that builders hit every day, with the init-order and account-sizing gotchas that cause silent failures, plus a use-case decision tree from requirement to extension set. It ships a read-only **mint inspector** (CLI and five MCP tools an agent can call) that decodes any mint or token account and flags wallet, DEX, and CEX risks with a 0-to-100 risk score, a verdict tier, and a concrete fix per finding: `inspect_mint` reports one mint plus a renounce-to-remediate path (what the verdict becomes once a live authority is renounced), `inspect_many` triages a whole listing set in one call with per-mint verdicts and an aggregate roll-up, `check_extension_compatibility` vets a planned extension set before any code exists, and `scaffold_mint` generates a correct, correctly-ordered, correctly-sized mint from a legal set (refusing any set the runtime would reject at init). A fifth tool, `generate_hook_transfer`, emits the correct transfer client for a hooked mint with its extra accounts resolved against the Execute account set.
- **Novel**: material nobody else ships as a skill: an **extension compatibility matrix** (including the runtime-enforced Scaled UI Amount versus Interest-Bearing exclusion and the required-companion rules), a **transfer-hook security audit checklist**, and an accurate **confidential-transfer status** (re-enabled on mainnet on 2026-06-04, verified from the on-chain `reenable_zk_elgamal_proof_program` feature gate, after the 2025-06-19 to 2026-06-04 disablement; tracking issue [token-2022#657](https://github.com/solana-program/token-2022/issues/657)). The matrix and integration rules are executable: the inspector turns them into a **conditional-severity risk engine** that scores a fund-loss-grade extension high only while its controlling authority is live (the live-versus-renounced model Jupiter uses to gate transfer-fee tokens, and Neodyme prescribes for hooks), emits a 0-to-100 score and a per-finding fix, and names every extension code 0 to 28, including those the published `@solana/spl-token` enum does not map (such as the confidential transfer fee on PYUSD), so a real mint decodes completely instead of showing "unrecognized". It is also the only entry that projects remediation: it recomputes the verdict for each authority an issuer could renounce, so the score becomes a path (CRITICAL today to MEDIUM once the permanent delegate is renounced), not just a label. It weighs a transfer fee by size, flagging a near-100% fee as a sell-blocking honeypot even when the rate is locked, and resolves the active versus a scheduled fee under the two-epoch rule. And it does not stop at audit: `scaffold_mint` turns a legal extension set into correct, correctly-ordered, correctly-sized mint code and refuses any set the runtime would reject at init. A transfer-hook codegen (`--hook-codegen`) emits the correct transfer client for a hooked mint, resolving the extra accounts against the Execute account set (the fix for the most common hook-integration bug).
- **Tested**: three reference builds run offline and deterministic, 111 checks total, plus a CI-gated live mainnet smoke test. A TypeScript multi-extension mint on LiteSVM (7 tests plus a transfer-hook end-to-end scenario), a native Rust transfer-hook program (`cargo build-sbf` plus 22 unit tests hardened to the security checklist), and the mint inspector (81 tests, including the conditional-severity model, the value-aware transfer-fee engine, the renounce-to-remediate projection, the batch triage, the build-time scaffold generator, the transfer-hook integration codegen, offline decodes of five captured mainnet mints, and a Token-2022 token account). A [THREAT_MODEL.md](THREAT_MODEL.md) maps each adversarial test to the threat it closes. Two inaccuracies were caught and corrected by running the code against PYUSD: a confidential-transfer-with-hook pair wrongly flagged as incompatible (PYUSD carries both), and an extension code the inspector now names instead of dropping. The hook example validates the mint's owner and each token account's mint linkage, and scopes its allow PDA per mint, so it matches the security checklist it ships.
- **Fits**: mirrors the reference skill shape (skill router, focused docs, agents, commands, rules, installer), so it can be submoduled into the kit. The inspector exposes five read-only MCP tools, `inspect_mint`, `inspect_many`, `check_extension_compatibility`, `scaffold_mint`, and `generate_hook_transfer`, with declared read-only annotations and a structured (agent-consumable) verdict, that an agent can call directly. It answers the kit's open request for a full Token Extension skill ([solana-ai-kit#12](https://github.com/solanabr/solana-ai-kit/issues/12)).

## How it compares

A like-for-like view of the Token-2022 entries in this bounty, by capability. The peer columns describe the other Token-2022 submissions by type (a docs-plus-hook skill, a mints-only risk auditor, and a build-only skill) as of June 2026; capabilities move, so treat the peer cells as a snapshot.

| Capability | This skill | Docs + hook skill | Mints-only auditor | Build-only skill |
|---|---|---|---|---|
| Agent-callable MCP tools | 5 (`inspect_mint`, `inspect_many`, `check_extension_compatibility`, `scaffold_mint`, `generate_hook_transfer`) | none | none | none |
| Decode and risk-score a live mint | yes (mints and token accounts) | no | yes (mints only) | no |
| Conditional severity (live vs renounced authority) | yes | no | yes | no |
| Risk score + per-finding fix | yes (0-to-100 + fix) | no | yes (tiered + fix templates) | no |
| Renounce-to-remediate projection (recomputed verdict) | yes | no | no (static templates) | no |
| Batch / portfolio triage in one call | yes (`inspect_many`) | no | no | no |
| Token-account inspection | yes | no | no | no |
| Value-aware fee (near-100% honeypot, scheduled jump) | yes | no | no | no |
| Build-time mint scaffold with guardrails | yes (`scaffold_mint`, refuses illegal sets) | no | no | no |
| Transfer-hook integration codegen | yes (`--hook-codegen`, Execute-set resolution) | no | no | no |
| Tested Rust transfer hook + builder (`cargo build-sbf`) | yes (22 unit tests, hardened) | hook only (~20 tests) | no | no |
| Full build + integrate + migrate surface | yes | partial (docs) | no (audit-only) | partial (build docs) |
| Offline deterministic suite | 111 checks + CI live smoke (build, hook, inspector, e2e) | hook tests | tested audit lib + CI | none |

The mints-only auditor is a capable, actively maintained peer on the audit axis (conditional severity, scoring, fix templates, CI). This skill matches that core and adds what the others lack: five agent-callable MCP tools, batch triage, a recomputed renounce-to-remediate projection, a value-aware transfer-fee engine, token-account inspection, a build-time scaffold generator that refuses illegal sets, and a tested Rust transfer hook plus the full build and integration surface. It is the only entry that has all of them.

## What's included

### Token-2022 knowledge (this addon)

Decide and combine: `overview.md`, `compatibility-matrix.md`.
Extension families: `transfer-fee.md`, `transfer-hook.md`, `metadata-and-groups.md`, `value-extensions.md`, `supply-controls.md`, `account-extensions.md`.
Operate and integrate: `migration.md`, `integration-compatibility.md`, `mint-inspector.md`, `client-codegen.md`, `testing.md`.
Security: `transfer-hook-security.md`, `confidential-transfer.md`.
Reference: `resources.md`.

### Tools

`mint-inspector.md` documents a read-only inspector that decodes a live mint's extensions and reports its wallet, DEX, and CEX integration risks. It ships as a CLI and five MCP tools in `examples/mint-inspector`: `inspect_mint` (decode and assess one live mint, with a renounce-to-remediate path), `inspect_many` (triage a list of mints in one call with per-mint verdicts and an aggregate), `check_extension_compatibility` (vet a planned extension set before any mint exists), `scaffold_mint` (generate a correct, correctly-ordered, correctly-sized mint from a legal extension set, refusing any set the runtime would reject at init), and `generate_hook_transfer` (emit a correct transfer client for a hooked mint, extra accounts resolved against the Execute set), with offline tests.

### Core (delegated to solana-dev-skill)

Program development (Anchor, Pinocchio), IDL and client codegen, base testing harness, and the base security checklist come from `solana-dev-skill`. This skill links to them and never duplicates them.

## Install

The installer copies `skill/*` into `~/.claude/skills/solana-token-extensions/`. By default it also registers the four agents into `~/.claude/agents/` and the six commands into `~/.claude/commands/`, so they work standalone as live subagents and slash commands. It does **not** modify your global `~/.claude/CLAUDE.md`, and it never overwrites an existing agent or command (a same-named file is skipped with a notice).

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
- Client: `@solana/kit` for transactions and codecs, `@solana/spl-token` for extension instruction builders. The split is deliberate: new client code in the docs uses `@solana/kit`, while the tested inspector stays on `@solana/spl-token` because its typed mint and account unpack helpers and `ExtensionType` codecs are the maintained source of truth for decoding a live mint (the `@solana/kit` line does not yet expose equivalents), so decoding is verified against the program's own getters rather than reimplemented.
- Tests: LiteSVM for offline extension behavior, run one file per process by the test runner (the native addon is stable that way). `solana-bankrun` is deprecated and not used.
- Confidential transfers: re-enabled on mainnet on 2026-06-04 (the `reenable_zk_elgamal_proof_program` feature gate is active and the ZK ElGamal Proof Program is executable again), ending the disablement that ran from 2025-06-19 (issue #657). Treated as live but handled with care: narrow wallet, DEX, and CEX support, and a compliance review for opaque balances.

## Tested reference code

All three examples run offline with no validator and no devnet.

```bash
cd examples
make verify     # builds the Rust hook, then runs the TS, inspector, and Rust suites
```

What passes (111 checks):

- `examples/ts-multi-extension-mint`: builds one mint combining transfer fee, metadata pointer, token metadata, and interest-bearing, then asserts the four extensions are present, the fee is withheld on receive and withdrawable, and the metadata reads back. Further tests assert that an out-of-order initialization is rejected and that the fee is capped and floored correctly. **7 tests, LiteSVM, offline.**
- `examples/transfer-hook-allowlist`: a native Rust transfer hook with a fail-closed allowlist, the transferring-flag gate, mint and account-linkage validation, a per-(mint, destination) allow PDA, and an `AddToAllowlist` instruction gated on the mint authority (the mint account is verified as Token-2022-owned before its authority is trusted). `cargo build-sbf` produces a deployable program and `cargo test` runs **22 unit tests**, including adversarial cases: a non-authority signer, a renounced mint authority, a forged (non-Token-2022) mint, an unexpected allow PDA, a mint-sized account passed where a token account is expected, instruction-discriminator non-collision, and account-count boundaries.
- End to end: `integration/transfer-hook-e2e.ts` loads the compiled hook, creates a Token-2022 mint that uses it, and proves a real transfer is **blocked** when the destination is not allowlisted and **allowed** after `AddToAllowlist`. It runs under tsx (`npm run e2e`): LiteSVM's native addon is stable in a plain process but aborts intermittently inside a vitest worker, so this BPF-executing scenario runs outside vitest.
- `examples/mint-inspector`: the read-only mint inspector (CLI and five MCP tools). It decodes a mint or a token account and scores it with conditional severity (a fund-loss-grade extension is high only while its authority is live), a value-aware transfer-fee engine (a near-100% fee is a honeypot even when locked; the active rate is resolved under the two-epoch rule), a 0-to-100 risk score, a per-finding fix, and a renounce-to-remediate projection. The risk engine, the remediation projection, the batch triage, the compatibility checker, the build-time scaffold generator, and the transfer-hook integration codegen are tested as pure functions; the decoder against Token-2022 mints built in LiteSVM, against five captured mainnet mints (PYUSD, USDC, BERN, sUSD, and a WNS hooked NFT) decoded offline, and against a built token account (withheld fees, immutable owner); and the MCP handlers with an injected fetcher (including a five-mint batch triaged against the captured mainnet data). **81 tests, offline.** See [examples/mint-inspector/README.md](examples/mint-inspector/README.md).

A captured run is committed at `examples/VERIFICATION_OUTPUT.txt`, and [THREAT_MODEL.md](THREAT_MODEL.md) maps each adversarial test to the threat it closes. Expected routing and assertions for representative prompts are in [EVALS.md](EVALS.md). A GitHub Actions workflow (`.github/workflows/verify.yml`) runs the Rust, inspector, and mint suites on every push, plus a best-effort live mainnet smoke test and the on-chain transfer-hook end-to-end scenario.

## Verified facts (checked June 2026)

| Component | Pinned | Source |
|---|---|---|
| `@solana/spl-token` | 0.4.14 | npmjs.com/package/@solana/spl-token |
| `@solana/spl-token-metadata` | 0.1.6 | npm |
| `@solana/web3.js` | 1.98.4 | npm |
| `litesvm` (JS) | 0.6.x | npmjs.com/package/litesvm (1.x moved to @solana/kit Address types; pinned to the web3.js 1.x line) |
| `spl-token-2022` (Rust) | 11.0.0 | docs.rs/spl-token-2022 |
| `spl-token-2022-interface` (Rust) | 3.1.0 (ExtensionType codes 0 to 28) | docs.rs/spl-token-2022-interface |
| `spl-transfer-hook-interface` | 2.1.0 | docs.rs/spl-transfer-hook-interface |
| `spl-tlv-account-resolution` | 0.11.1 | docs.rs/spl-tlv-account-resolution |
| Toolchain | solana-cli 3.1.9, cargo-build-sbf 3.1.9, Node 22 | local |
| Confidential transfers | re-enabled on mainnet 2026-06-04 (`reenable_zk_elgamal_proof_program` gate active, proof program executable); disabled 2025-06-19 to 2026-06-04 | on-chain feature gates; github.com/solana-program/token-2022/issues/657 |

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
│   ├── ts-multi-extension-mint/    TypeScript mint + LiteSVM tests + e2e integration script
│   ├── transfer-hook-allowlist/    native Rust hook + unit tests
│   ├── mint-inspector/             read-only mint inspector (CLI + 5 MCP tools) + offline tests
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

Then add one routing line for it in the kit's hub `.claude/skills/SKILL.md` (and, optionally, a catalog entry in `.claude/skills/skill-registry.json`). See [KIT_INTEGRATION.md](KIT_INTEGRATION.md) for the exact hub line, the optional registry entry, and the fork-and-PR steps.

## Contributing

Issues and pull requests are welcome. Keep the standards the repo already follows: focused, token-efficient docs that cite a primary source for any non-obvious claim, errors as values with no type suppression in code, and tests that run offline.

## License

MIT. See [LICENSE](LICENSE).
