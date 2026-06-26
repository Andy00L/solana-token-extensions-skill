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
  "description": "Token-2022 mastery: extension compatibility matrix, transfer-hook security audit, confidential-transfer status, fees, metadata, migration, tested TypeScript and Rust reference code, and a read-only mint inspector (CLI plus two MCP tools, inspect_mint and check_extension_compatibility) that decodes a mint or token account and scores its wallet, DEX, and CEX integration risk with conditional severity (fund-loss-grade only while the authority is live), a 0-to-100 score, and a per-finding fix. Delegates core program development to solana-dev.",
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
    "last_commit": "2026-06-21",
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
- [ext/solana-token-extensions/skill/SKILL.md](ext/solana-token-extensions/skill/SKILL.md) - Token-2022 mastery (tested): extension compatibility matrix, transfer-hook security audit, accurate confidential-transfer status (disabled on mainnet since June 2025, issue #657), SPL-to-Token-2022 migration, wallet/DEX/CEX integration, and a read-only mint inspector (CLI + MCP `inspect_mint` and `check_extension_compatibility`). The deeper, tested companion to `token-2022.md`.
```

The skill's own `SKILL.md` router then progressively discloses the focused docs (`overview.md`, `compatibility-matrix.md`, `transfer-hook-security.md`, `confidential-transfer.md`, `mint-inspector.md`, `migration.md`, and the rest), so one hub line is enough.

## 4. MCP tools (inspect_mint, check_extension_compatibility)

The skill also ships an MCP server that exposes two read-only tools under `examples/mint-inspector`. An agent in the kit can call them without writing code.

```bash
cd .claude/skills/ext/solana-token-extensions/examples/mint-inspector
npm install
npm run mcp        # serves both tools over stdio
```

- `inspect_mint` takes `{ mintAddress: string, rpcUrl?: string }`, fetches one account, and returns a text report plus the JSON inspection. It is read only: it never signs or sends.
- `check_extension_compatibility` takes `{ extensions: string[] }` and returns the conflicts and wallet, DEX, and CEX posture of a planned extension set, with no IO at all.

Register them in the kit's MCP client configuration by pointing the client at that command.

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

Map the PR description to the four judging axes: Usefulness (full Token-2022 surface, a use-case decision tree, and a mint inspector plus a compatibility checker an agent can call without writing code), Novelty (compatibility matrix with the runtime-enforced exclusions, transfer-hook security audit, precise confidential-transfer status, and an executable risk engine that decodes codes the JS enum does not yet name), Quality (tested TypeScript and Rust reference code, 60 offline checks, conditional-severity risk scoring grounded in real integrator behavior such as Jupiter's transfer-fee handling, two inaccuracies caught by running the inspector against PYUSD, and a hook example that validates mint ownership and account linkage per Neodyme's checklist), and Fit (submodule plus registry plus hub routing, two MCP tools, delegates to solana-dev).
