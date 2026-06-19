#!/usr/bin/env bash
# OpenSpec workspace bootstrap — append after git clone and project install in hooks.after_create.
#
# Prerequisites (manual, on Symphony host, once):
#   - openspec CLI on PATH (openspec --version)
#   - symphony-openspec-bundle cloned; SYMPHONY_POLICY_ROOT points at bundle root
#   - Cursor agent CLI, symphony-ts, tracker credentials (see docs/symphony-agent-workflow.md)
#
# Runtime skills 来自独立仓 symphony-openspec-bundle，不从 symphony-ts 拷贝。

set -euo pipefail

openspec --version

if [ ! -f openspec/config.yaml ]; then
  openspec init --tools none
fi

if [ ! -f openspec/config.yaml ]; then
  echo "openspec workspace bootstrap failed: openspec/config.yaml missing" >&2
  exit 1
fi

if [ -n "${SYMPHONY_POLICY_ROOT:-}" ] && [ -f "${SYMPHONY_POLICY_ROOT}/bootstrap/install.sh" ]; then
  bash "${SYMPHONY_POLICY_ROOT}/bootstrap/install.sh" "$(pwd)"
elif [ -n "${SYMPHONY_POLICY_ROOT:-}" ]; then
  echo "SYMPHONY_POLICY_ROOT set but bootstrap/install.sh not found: ${SYMPHONY_POLICY_ROOT}" >&2
  exit 1
else
  echo "[bootstrap] SYMPHONY_POLICY_ROOT 未设置，仅 openspec init，无 V1.1 定制 skills" >&2
fi

echo "openspec workspace bootstrap ok"
