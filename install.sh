#!/usr/bin/env bash
set -euo pipefail

# Installer for the Solana Token-2022 (Token Extensions) skill.
# Copies skill/* into ~/.claude/skills/solana-token-extensions/, and by default
# also registers the agents and commands as live Claude Code subagents and slash
# commands. It does not modify your global ~/.claude/CLAUDE.md, and it never
# overwrites an existing agent or command (a same-named file is skipped).

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/skill"
SKILLS_DIR="$HOME/.claude/skills"
SKILL_NAME="solana-token-extensions"
TARGET_DIR="$SKILLS_DIR/$SKILL_NAME"
AGENTS_DIR="$HOME/.claude/agents"
COMMANDS_DIR="$HOME/.claude/commands"
CORE_SKILL_PATH="$SKILLS_DIR/solana-dev"
CORE_SKILL_REPO="https://github.com/solana-foundation/solana-dev-skill"

SKIP_CONFIRM=false
INSTALL_EXTRAS=true

print_help() {
  cat <<EOF
Install the Solana Token-2022 (Token Extensions) skill into ~/.claude/skills/.

By default it also registers the agents (subagents) and commands (slash commands)
into ~/.claude/agents/ and ~/.claude/commands/. Existing files are never
overwritten; a same-named agent or command is skipped with a notice.

Usage: ./install.sh [-y|--yes] [--skill-only] [-h|--help]
  -y, --yes        Skip the confirmation prompt.
  --skill-only     Install only the skill, not the agents and commands.
  -h, --help       Show this help.
EOF
}

# Copy agent files into ~/.claude/agents/, rewriting repo-relative links to the
# installed absolute paths so they resolve outside the repo. Skip existing files.
install_agents() {
  [ -d "$SCRIPT_DIR/agents" ] || return 0
  mkdir -p "$AGENTS_DIR"
  for agent_file in "$SCRIPT_DIR"/agents/*.md; do
    agent_name="$(basename "$agent_file")"
    dest="$AGENTS_DIR/$agent_name"
    if [ -e "$dest" ]; then
      echo -e "  ${YELLOW}skip existing agent: $agent_name${NC}"
      continue
    fi
    sed -e "s#\.\./skill/#$TARGET_DIR/#g" -e "s#\.\./commands/#$COMMANDS_DIR/#g" \
      "$agent_file" > "$dest"
    echo "  agent:   $agent_name"
  done
}

# Copy command files into ~/.claude/commands/, rewriting repo-relative links to
# the installed absolute paths. Skip existing files.
install_commands() {
  [ -d "$SCRIPT_DIR/commands" ] || return 0
  mkdir -p "$COMMANDS_DIR"
  for command_file in "$SCRIPT_DIR"/commands/*.md; do
    command_name="$(basename "$command_file")"
    dest="$COMMANDS_DIR/$command_name"
    if [ -e "$dest" ]; then
      echo -e "  ${YELLOW}skip existing command: $command_name${NC}"
      continue
    fi
    sed -e "s#\.\./skill/#$TARGET_DIR/#g" -e "s#\.\./agents/#$AGENTS_DIR/#g" \
      "$command_file" > "$dest"
    echo "  command: /${command_name%.md}"
  done
}

while [ $# -gt 0 ]; do
  case "$1" in
    -y|--yes) SKIP_CONFIRM=true ;;
    --skill-only) INSTALL_EXTRAS=false ;;
    -h|--help) print_help; exit 0 ;;
    *) echo -e "${RED}Unknown argument: $1${NC}"; print_help; exit 1 ;;
  esac
  shift
done

echo -e "${BOLD}Solana Token-2022 (Token Extensions) skill installer${NC}"
echo "Skill target: $TARGET_DIR"
if [ "$INSTALL_EXTRAS" = true ]; then
  echo "Agents:       $AGENTS_DIR (skips existing)"
  echo "Commands:     $COMMANDS_DIR (skips existing)"
fi

if [ ! -d "$SOURCE_DIR" ]; then
  echo -e "${RED}Cannot find the skill/ directory next to this script.${NC}"
  exit 1
fi

if [ "$SKIP_CONFIRM" = false ]; then
  read -r -p "Proceed with installation? [Y/n] " reply
  if [[ "$reply" =~ ^[Nn]$ ]]; then
    echo "Cancelled."
    exit 0
  fi
fi

mkdir -p "$SKILLS_DIR"

if [ -d "$TARGET_DIR" ]; then
  backup="$TARGET_DIR.backup"
  echo -e "${YELLOW}Existing install found. Backing up to $backup${NC}"
  rm -rf "$backup"
  mv "$TARGET_DIR" "$backup"
fi

mkdir -p "$TARGET_DIR"
for item in "$SOURCE_DIR"/*; do
  base="$(basename "$item")"
  if [ "$base" != "solana-dev-skill" ]; then
    cp -r "$item" "$TARGET_DIR/"
  fi
done
echo -e "${GREEN}Installed skill files to $TARGET_DIR${NC}"

if [ "$INSTALL_EXTRAS" = true ]; then
  echo "Registering agents and commands (existing files are skipped):"
  install_agents
  install_commands
fi

if [ ! -d "$CORE_SKILL_PATH" ]; then
  echo -e "${YELLOW}Core skill solana-dev not found at $CORE_SKILL_PATH${NC}"
  if command -v git >/dev/null 2>&1; then
    echo "Cloning $CORE_SKILL_REPO ..."
    if git clone --depth 1 "$CORE_SKILL_REPO" "$CORE_SKILL_PATH" >/dev/null 2>&1; then
      echo -e "${GREEN}Installed core skill to $CORE_SKILL_PATH${NC}"
    else
      echo -e "${YELLOW}Could not clone the core skill. Install solana-dev-skill manually for full routing.${NC}"
    fi
  else
    echo -e "${YELLOW}git not found. Install solana-dev-skill manually for full routing.${NC}"
  fi
fi

echo
echo -e "${GREEN}${BOLD}Done.${NC}"
echo "Try a prompt like:"
echo "  Create a Token-2022 mint with a transfer fee and on-chain metadata."
echo "  Audit this transfer hook for security issues."
if [ "$INSTALL_EXTRAS" = true ]; then
  echo "Or a slash command like:  /scaffold-mint transfer-fee, metadata"
fi
