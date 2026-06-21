#!/usr/bin/env bash
set -euo pipefail

# Interactive installer for the Solana Token-2022 (Token Extensions) skill.
# Lets you choose the skills directory, whether to register agents and commands,
# and whether to install the core skill. Existing files are never overwritten.

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_DIR="$SCRIPT_DIR/skill"
DEFAULT_SKILLS_DIR="$HOME/.claude/skills"
SKILL_NAME="solana-token-extensions"

echo -e "${BOLD}Solana Token-2022 skill: custom install${NC}"

read -r -p "Skills directory [$DEFAULT_SKILLS_DIR]: " skills_dir
skills_dir="${skills_dir:-$DEFAULT_SKILLS_DIR}"
target_dir="$skills_dir/$SKILL_NAME"
agents_dir="$HOME/.claude/agents"
commands_dir="$HOME/.claude/commands"

read -r -p "Register agents and commands globally (skips existing)? [Y/n] " want_extras
read -r -p "Also install the core solana-dev skill if missing? [Y/n] " want_core

if [ ! -d "$SOURCE_DIR" ]; then
  echo -e "${RED}Missing skill/ directory.${NC}"
  exit 1
fi

mkdir -p "$skills_dir"

if [ -d "$target_dir" ]; then
  echo -e "${YELLOW}Backing up existing install to $target_dir.backup${NC}"
  rm -rf "$target_dir.backup"
  mv "$target_dir" "$target_dir.backup"
fi

mkdir -p "$target_dir"
for item in "$SOURCE_DIR"/*; do
  base="$(basename "$item")"
  if [ "$base" != "solana-dev-skill" ]; then
    cp -r "$item" "$target_dir/"
  fi
done
echo -e "${GREEN}Installed to $target_dir${NC}"

if [[ ! "$want_extras" =~ ^[Nn]$ ]]; then
  mkdir -p "$agents_dir" "$commands_dir"
  if [ -d "$SCRIPT_DIR/agents" ]; then
    for agent_file in "$SCRIPT_DIR"/agents/*.md; do
      name="$(basename "$agent_file")"
      if [ -e "$agents_dir/$name" ]; then
        echo -e "  ${YELLOW}skip existing agent: $name${NC}"
        continue
      fi
      sed -e "s#\.\./skill/#$target_dir/#g" -e "s#\.\./commands/#$commands_dir/#g" \
        "$agent_file" > "$agents_dir/$name"
      echo "  agent:   $name"
    done
  fi
  if [ -d "$SCRIPT_DIR/commands" ]; then
    for command_file in "$SCRIPT_DIR"/commands/*.md; do
      name="$(basename "$command_file")"
      if [ -e "$commands_dir/$name" ]; then
        echo -e "  ${YELLOW}skip existing command: $name${NC}"
        continue
      fi
      sed -e "s#\.\./skill/#$target_dir/#g" -e "s#\.\./agents/#$agents_dir/#g" \
        "$command_file" > "$commands_dir/$name"
      echo "  command: /${name%.md}"
    done
  fi
fi

if [[ ! "$want_core" =~ ^[Nn]$ ]]; then
  core_dir="$skills_dir/solana-dev"
  if [ -d "$core_dir" ]; then
    echo "Core skill already present at $core_dir"
  elif command -v git >/dev/null 2>&1; then
    if git clone --depth 1 https://github.com/solana-foundation/solana-dev-skill "$core_dir" >/dev/null 2>&1; then
      echo -e "${GREEN}Installed core skill to $core_dir${NC}"
    else
      echo -e "${YELLOW}Could not clone the core skill; install it manually.${NC}"
    fi
  else
    echo -e "${YELLOW}git not found; install the core skill manually.${NC}"
  fi
fi

echo -e "${GREEN}${BOLD}Done.${NC}"
