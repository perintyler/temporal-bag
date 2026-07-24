#!/usr/bin/env bash
#
# Setup script for the temporal pack.
#
# Clones official Temporal skill repos into sibling directories and symlinks
# each into this pack's skills/temporal/ folder.
#
# Re-run at any time to pull updates.
#
# Usage:
#   ./setup.sh            # clone or pull, then symlink
#   ./setup.sh --status   # show what's linked
#
set -euo pipefail

PACK_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILLS_TARGET="$PACK_DIR/skills/temporal"

# repo_url | clone_dir_name | skill_name
SKILL_REPOS=(
  "https://github.com/temporalio/skill-temporal-developer.git|temporal-developer-skill|temporal-developer"
  "https://github.com/temporalio/skill-temporal-design.git|temporal-design-skill|temporal-design"
)

# ── Helpers ──────────────────────────────────────────────────────────────────

log()  { printf "\033[1;34m==>\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33mwarn:\033[0m %s\n" "$*"; }
err()  { printf "\033[1;31merror:\033[0m %s\n" "$*" >&2; exit 1; }

# ── Clone or update ─────────────────────────────────────────────────────────

clone_or_update() {
  local repo_url="$1"
  local clone_dir="$2"
  local target="$PACK_DIR/../$clone_dir"

  if [[ -d "$target/.git" ]]; then
    log "Updating $clone_dir (git pull)..."
    git -C "$target" pull --ff-only --quiet
  else
    log "Cloning $repo_url -> $target ..."
    git clone "$repo_url" "$target"
  fi
}

# ── Symlink skills ──────────────────────────────────────────────────────────

link_skill() {
  local clone_dir="$1"
  local skill_name="$2"
  local source="$PACK_DIR/../$clone_dir"
  local link_path="$SKILLS_TARGET/$skill_name"

  mkdir -p "$SKILLS_TARGET"

  # Verify the repo has a SKILL.md
  if [[ ! -f "$source/SKILL.md" ]]; then
    warn "No SKILL.md found in $source — skipping"
    return
  fi

  # Remove stale symlinks
  if [[ -L "$link_path" ]] && [[ ! -e "$link_path" ]]; then
    rm "$link_path"
  fi

  # Create or update symlink
  if [[ -L "$link_path" ]]; then
    local current_target
    current_target="$(readlink "$link_path")"
    if [[ "$current_target" != "$source" && "$current_target" != "${source%/}" ]]; then
      rm "$link_path"
      ln -s "$source" "$link_path"
    fi
  elif [[ -d "$link_path" ]]; then
    warn "Skipping $skill_name — directory exists (not a symlink)"
    return
  else
    ln -s "$source" "$link_path"
  fi

  log "Linked $skill_name"
}

# ── Status ──────────────────────────────────────────────────────────────────

show_status() {
  printf "\n\033[1m%-40s %-10s %s\033[0m\n" "Skill" "Type" "Target"
  printf "%s\n" "$(printf '%.0s─' {1..90})"

  if [[ ! -d "$SKILLS_TARGET" ]]; then
    printf "  (no skills linked — run ./setup.sh first)\n"
    return
  fi

  local found=0
  for item in "$SKILLS_TARGET"/*/; do
    [[ ! -d "$item" ]] && continue
    found=1
    local name canonical
    name="$(basename "$item")"
    canonical="${item%/}"

    if [[ -L "$canonical" ]]; then
      local target
      target="$(readlink "$canonical")"
      printf "%-40s %-10s %s\n" "$name" "symlink" "$target"
    else
      printf "%-40s %-10s %s\n" "$name" "native" "-"
    fi
  done

  if [[ $found -eq 0 ]]; then
    printf "  (no skills linked — run ./setup.sh first)\n"
  fi
}

# ── Main ────────────────────────────────────────────────────────────────────

main() {
  if [[ "${1:-}" == "--status" ]]; then
    show_status
    exit 0
  fi

  for entry in "${SKILL_REPOS[@]}"; do
    IFS='|' read -r repo_url clone_dir skill_name <<< "$entry"
    clone_or_update "$repo_url" "$clone_dir"
    link_skill "$clone_dir" "$skill_name"
  done

  printf "\n"
  show_status
  printf "\n\033[1;32mDone.\033[0m Run \`./setup.sh --status\` to check at any time.\n"
}

main "$@"
