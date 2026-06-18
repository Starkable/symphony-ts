#!/usr/bin/env bash
# OpenSpec workspace bootstrap — append after git clone and project install in hooks.after_create.
#
# Prerequisites (manual, on Symphony host, once):
#   - openspec CLI on PATH (openspec --version)
#   - Cursor agent CLI, symphony-ts, tracker credentials (see docs/symphony-agent-workflow.md)
#
# This script does NOT install openspec. It initializes openspec/ in the workspace when missing.

set -euo pipefail

openspec --version

if [ ! -f openspec/config.yaml ]; then
  openspec init --tools none
fi

if [ ! -f openspec/config.yaml ]; then
  echo "openspec workspace bootstrap failed: openspec/config.yaml missing" >&2
  exit 1
fi

# Optional: copy Policy / OpenSpec skills when SYMPHONY_POLICY_ROOT points at symphony-ts (or a policy bundle).
if [ -n "${SYMPHONY_POLICY_ROOT:-}" ] && [ -d "${SYMPHONY_POLICY_ROOT}/.cursor/skills" ]; then
  mkdir -p .cursor/skills .agents/skills
  for skill in "${SYMPHONY_POLICY_ROOT}/.cursor/skills"/openspec-*; do
    [ -e "$skill" ] || continue
    cp -r "$skill" .cursor/skills/
  done
  if [ -d "${SYMPHONY_POLICY_ROOT}/.agents/skills/symphony-v1-policy" ]; then
    cp -r "${SYMPHONY_POLICY_ROOT}/.agents/skills/symphony-v1-policy" .agents/skills/
  fi
fi

echo "openspec workspace bootstrap ok"
