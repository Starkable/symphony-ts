#!/usr/bin/env bash
# OpenSpec workspace bootstrap — 多项目模式 after_create 核心步骤（无业务 git clone）
#
# Prerequisites（宿主机一次）:
#   - openspec CLI on PATH
#   - SYMPHONY_POLICY_ROOT → symphony-openspec-bundle
#   - 多项目：SYMPHONY_REPO_ROOT、catalog、MCP 索引（见 docs/multi-repo-workspace.md）
#
# 分工:
#   after_create  → 本脚本（openspec init + skills 引用）
#   before_run    → docs/snippets/materialize-repos.sh（plan 前 clone repos/*）
#   clarify       → MCP 读代码，不写 repos/

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
  echo "[bootstrap] SYMPHONY_POLICY_ROOT 未设置，仅 openspec init，无 Policy skills" >&2
fi

if [ ! -f .cursor/skills/openspec-new-change/SKILL.md ]; then
  echo "openspec workspace bootstrap failed: policy skills missing" >&2
  exit 1
fi

echo "openspec workspace bootstrap ok (multi-repo: no business clone in after_create)"
