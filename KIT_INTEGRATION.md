# Integrating into the Solana AI Kit

This skill slots into [solana-ai-kit](https://github.com/solanabr/solana-ai-kit) the same way the core Solana `ext/` skills (solana-dev, solana-game, metaplex) are wired: a git submodule under `.claude/skills/ext/`, plus one routing line in the hub `.claude/skills/SKILL.md`. A `skill-registry.json` catalog entry is optional (some skills have one, the core Solana ext skills do not). The kit already ships a hub `token-2022.md`; this skill is the deeper, tested, tooling-backed companion to it (extension compatibility matrix, transfer-hook security audit, corrected confidential-transfer status, and the mint inspector). Below are the exact edits and the fork-and-PR flow.

## 1. Submodule

```bash
git submodule add https://github.com/Andy00L/solana-token-extensions-skill \
  .claude/skills/ext/solana-token-extensions
```

## 2. Registry entry (optional)

The core Solana ext skills (solana-dev, solana-game, metaplex, jupiter) are not in `skill-registry.json`; some skills (for example meteora-sdk-skill) are. An entry adds catalog discoverability. If you include one, append this object to the `entries` array in `.claude/skills/skill-registry.json` (schema confirmed against the existing submodule entries):

```json
{
  "id": "solana-token-extensions",
  "name": "Solana Token-2022 (Token Extensions)",
  "type": "skill",
  "domain": "solana-tokens",
  "description": "Token-2022 mastery: extension compatibility matrix, transfer-hook security audit, confidential-transfer status, fees, metadata, migration, tested TypeScript and Rust reference code, and a read-only mint inspector (CLI plus five MCP tools: inspect_mint, inspect_many, check_extension_compatibility, scaffold_mint, generate_hook_transfer) that decodes a mint or token account and scores its wallet, DEX, and CEX integration risk with conditional severity (fund-loss-grade only while the authority is live), a value-aware fee engine, a 0-to-100 score, a per-finding fix, and a renounce-to-remediate path; inspect_many triages a whole listing set in one call, and scaffold_mint emits correct mint code from a legal extension set. Delegates core program development to solana-dev.",
  "source": "https://github.com/Andy00L/solana-token-extensions-skill",
  "install": {
    "method": "submodule",
    "command": "git submodule add https://github.com/Andy00L/solana-token-extensions-skill .claude/skills/ext/solana-token-extensions",
    "env": []
  },
  "license": "MIT",
  "maintainer": "Andy00L",
  "signal": {
    "stars": null,
    "last_commit": "2026-06-27",
    "reputability": "individual"
  },
  "default_installed": false,
  "safety": "clean",
  "tags": ["solana", "token-2022", "token-extensions", "transfer-hook", "confidential-transfer", "metadata", "spl", "mint-inspector", "mcp"]
}
```

## 3. Hub routing (required)

The hub `.claude/skills/SKILL.md` already has a `## Token Extensions` section with a single `token-2022.md` line. Add this skill as a second bullet directly under that line (do not create a new section):

```markdown
- [ext/solana-token-extensions/skill/SKILL.md](ext/solana-token-extensions/skill/SKILL.md) - Token-2022 mastery (tested): extension compatibility matrix, transfer-hook security audit, accurate confidential-transfer status (re-enabled on mainnet 2026-06-04, issue #657), SPL-to-Token-2022 migration, wallet/DEX/CEX integration, and a read-only mint inspector (CLI + 5 MCP tools: `inspect_mint`, `inspect_many`, `check_extension_compatibility`, `scaffold_mint`, `generate_hook_transfer`). The deeper, tested companion to `token-2022.md`.
```

The skill's own `SKILL.md` router then progressively discloses the focused docs (`overview.md`, `compatibility-matrix.md`, `transfer-hook-security.md`, `confidential-transfer.md`, `mint-inspector.md`, `migration.md`, and the rest), so one hub line is enough.

## 4. MCP tools (inspect_mint, inspect_many, check_extension_compatibility, scaffold_mint, generate_hook_transfer)

The skill also ships an MCP server that exposes five read-only tools under `examples/mint-inspector`. An agent in the kit can call them without writing code.

```bash
cd .claude/skills/ext/solana-token-extensions/examples/mint-inspector
npm install
npm run mcp        # serves the five tools over stdio
```

- `inspect_mint` takes `{ mintAddress: string, rpcUrl?: string }`, fetches one account, and returns a text report (with a renounce-to-remediate path) plus the JSON inspection. It is read only: it never signs or sends.
- `inspect_many` takes `{ mintAddresses: string[], rpcUrl?: string }` (up to 50) and returns a per-address verdict plus an aggregate roll-up (worst verdict, counts by severity, how many carry a CEX listing blocker), for triaging a listing set in one call.
- `check_extension_compatibility` takes `{ extensions: string[] }` and returns the conflicts and wallet, DEX, and CEX posture of a planned extension set, with no IO at all.
- `scaffold_mint` takes `{ extensions: string[], decimals?: number }` and returns an init plan plus mint-creation code with the order and sizing correct, refusing any set the runtime would reject at init; offline.
- `generate_hook_transfer` takes `{ mint: string, hookProgramId: string, decimals?: number }` and returns a correct transfer client for a hooked mint, with the extra accounts resolved against the Execute account set, plus a static classification of the hook's extra-account model; offline.

Register them in the kit's MCP client configuration by pointing the client at that command. Each tool declares read-only annotations and returns a structured, agent-consumable verdict.

## 5. Fork and open the PR

```bash
# Fork solanabr/solana-ai-kit on GitHub first, then:
git clone https://github.com/<your-handle>/solana-ai-kit
cd solana-ai-kit
git checkout -b add-solana-token-extensions

# Apply step 1 (submodule) and step 3 (hub routing). Step 2 (registry) is optional.
git add .gitmodules .claude/skills/ext/solana-token-extensions .claude/skills/SKILL.md
# only if you added the optional registry entry:
git add .claude/skills/skill-registry.json
git commit -m "Add solana-token-extensions (Token-2022) ext skill"
git push -u origin add-solana-token-extensions

# Open a PR from your fork to solanabr/solana-ai-kit.
```

Map the PR description to the four judging axes: Usefulness (full Token-2022 surface, a use-case decision tree, a mint inspector with a renounce-to-remediate path, a batch listing-set triage, and a compatibility checker an agent can call without writing code), Novelty (compatibility matrix with the runtime-enforced exclusions, transfer-hook security audit, precise confidential-transfer status, an executable conditional-severity risk engine that decodes codes the JS enum does not yet name, a value-aware fee engine, a renounce-to-remediate projection no other entry ships, a build-time mint-scaffold generator that refuses runtime-rejected sets, and a transfer-hook integration codegen that resolves extra accounts against the Execute account set), Quality (tested TypeScript and Rust reference code, 114 offline checks (including a 16-case scored eval suite that runs the executable EVALS.md rows through the engine) plus a CI live-mainnet smoke test, a THREAT_MODEL.md mapping each adversarial test to the threat it closes, conditional-severity risk scoring grounded in real integrator behavior such as Jupiter's transfer-fee handling, two inaccuracies caught by running the inspector against PYUSD, and a hook example with 22 unit tests that validates mint ownership and account linkage per Neodyme's checklist), and Fit (submodule plus registry plus hub routing, five read-only MCP tools with structured agent-consumable verdicts, delegates to solana-dev, and answers kit issue #12).
