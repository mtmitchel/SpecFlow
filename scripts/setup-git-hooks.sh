#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

chmod +x \
  "$repo_root/scripts/git-hooks/pre-commit" \
  "$repo_root/scripts/git-hooks/pre-push"

git -C "$repo_root" config core.hooksPath scripts/git-hooks

printf 'Configured git hooks at %s\n' "$repo_root/scripts/git-hooks"
