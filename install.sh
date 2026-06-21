#!/usr/bin/env bash
set -euo pipefail

# Installer for the Solana Token-2022 (Token Extensions) skill.
# Copies skill/* into ~/.claude/skills/solana-token-extensions/.
# It does not modify your global ~/.claude/CLAUDE.md.

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
CORE_SKILL_PATH="$SKILLS_DIR/solana-dev"
CORE_SKILL_REPO="https://github.com/solana-foundation/solana-dev-skill"

SKIP_CONFIRM=false

print_help() {
  cat <<EOF
Install the Solana Token-2022 (Token Extensions) skill into ~/.claude/skills/.

Usage: ./install.sh [-y|--yes] [-h|--help]
  -y, --yes    Skip the confirmation prompt.
  -h, --help   Show this help.
EOF
}

case "${1:-}" in
  -y|--yes) SKIP_CONFIRM=true ;;
  -h|--help) print_help; exit 0 ;;
  "") ;;
  *) echo -e "${RED}Unknown argument: $1${NC}"; print_help; exit 1 ;;
esac

echo -e "${BOLD}Solana Token-2022 (Token Extensions) skill installer${NC}"
echo "Target: $TARGET_DIR"

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
