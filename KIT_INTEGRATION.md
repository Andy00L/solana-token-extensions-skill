# Integrating into the Solana AI Kit

This skill is built to slot into [solana-ai-kit](https://github.com/solanabr/solana-ai-kit) the same way the other `ext/` skills are wired: a git submodule, a `skill-registry.json` entry, and routing rows in the hub `SKILL.md`. Below is the exact set of edits and the fork-and-PR flow.

## 1. Submodule

```bash
git submodule add https://github.com/Andy00L/solana-token-extensions-skill \
  .claude/skills/ext/solana-token-extensions
```

## 2. Registry entry

Add this object to the `entries` array in `.claude/skills/skill-registry.json`:

```json
{
  "id": "solana-token-extensions",
  "name": "Solana Token-2022 (Token Extensions)",
  "type": "skill",
  "domain": "solana-tokens",
  "description": "Token-2022 mastery: extension compatibility matrix, transfer-hook security audit, confidential-transfer status, fees, metadata, migration, tested TypeScript and Rust reference code, and a read-only mint inspector (CLI plus MCP inspect_mint tool) that decodes a mint's extensions and reports wallet, DEX, and CEX integration risk. Delegates core program development to solana-dev.",
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

## 3. Hub routing

Add this block to `.claude/skills/SKILL.md`:

```markdown
## Token-2022 (Token Extensions)

From [solana-token-extensions-skill](ext/solana-token-extensions/skill/):

- [ext/solana-token-extensions/skill/SKILL.md](ext/solana-token-extensions/skill/SKILL.md) - Token-2022 entry point
- [overview.md](ext/solana-token-extensions/skill/overview.md) - Token-2022 vs SPL Token
- [compatibility-matrix.md](ext/solana-token-extensions/skill/compatibility-matrix.md) - Which extensions combine, and the init order
- [transfer-hook-security.md](ext/solana-token-extensions/skill/transfer-hook-security.md) - Transfer-hook audit checklist
- [confidential-transfer.md](ext/solana-token-extensions/skill/confidential-transfer.md) - Confidential transfer status
- [mint-inspector.md](ext/solana-token-extensions/skill/mint-inspector.md) - Decode a live mint and assess its integration risk (CLI and MCP tool)
- [migration.md](ext/solana-token-extensions/skill/migration.md) - SPL Token to Token-2022
```

And add these rows to the hub's task-routing table:

```
| Token-2022 extension selection | ext/solana-token-extensions -> overview.md |
| Which extensions can combine | ext/solana-token-extensions -> compatibility-matrix.md |
| Audit a transfer hook | ext/solana-token-extensions -> transfer-hook-security.md |
| Inspect a mint address | ext/solana-token-extensions -> mint-inspector.md |
| Migrate SPL Token to Token-2022 | ext/solana-token-extensions -> migration.md |
```

## 4. MCP tool (inspect_mint)

The skill also ships an MCP server that exposes one read-only tool, `inspect_mint`, under `examples/mint-inspector`. An agent in the kit can call it to decode a mint and assess its integration risk without writing code.

```bash
cd .claude/skills/ext/solana-token-extensions/examples/mint-inspector
npm install
npm run mcp        # serves inspect_mint over stdio
```

Register it in the kit's MCP client configuration by pointing the client at that command. The tool takes `{ mintAddress: string, rpcUrl?: string }` and returns a text report plus the JSON inspection. It is read only: it fetches one account and never signs or sends.

## 5. Fork and open the PR

```bash
# Fork solanabr/solana-ai-kit on GitHub first, then:
git clone https://github.com/<your-handle>/solana-ai-kit
cd solana-ai-kit
git checkout -b add-solana-token-extensions

# Apply steps 1 to 3 above, then:
git add .gitmodules .claude/skills/ext/solana-token-extensions \
        .claude/skills/skill-registry.json .claude/skills/SKILL.md
git commit -m "Add solana-token-extensions (Token-2022) ext skill"
git push -u origin add-solana-token-extensions

# Open a PR from your fork to solanabr/solana-ai-kit.
```

Map the PR description to the four judging axes: Usefulness (full Token-2022 surface, plus a mint inspector for due diligence without writing code), Novelty (compatibility matrix, transfer-hook security audit, confidential-transfer status, and an executable risk engine behind the inspector), Quality (tested TypeScript and Rust reference code, 31 offline tests), and Fit (submodule plus registry plus hub routing, an MCP inspect_mint tool, delegates to solana-dev).
