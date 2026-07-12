#!/usr/bin/env bash
# 按 scope.json + catalog.yaml 将业务仓物化至 workspace/repos/<repo_key>/
# 用于 WORKFLOW hooks.before_run（plan 阶段首次 turn 前，幂等）
set -euo pipefail

CATALOG_FILE="${SYMPHONY_CATALOG_FILE:-}"
if [[ -z "$CATALOG_FILE" && -n "${SYMPHONY_REPO_ROOT:-}" ]]; then
  CATALOG_FILE="${SYMPHONY_REPO_ROOT}/services/catalog.yaml"
fi
if [[ -z "$CATALOG_FILE" ]]; then
  CATALOG_FILE="$(cd "$(dirname "$0")/../.." && pwd)/services/catalog.yaml"
fi

WORKSPACE="$(pwd)"
CHANGES_DIR="$WORKSPACE/openspec/changes"

log() { echo "[materialize-repos] $*"; }

if [[ ! -d "$CHANGES_DIR" ]]; then
  log "无 openspec/changes，跳过"
  exit 0
fi

materialize_change() {
  local change_dir="$1"
  local change_ref
  change_ref="$(basename "$change_dir")"
  local scope_file="$change_dir/scope.json"
  local review_file="$change_dir/proposal_review.md"
  local tasks_file="$change_dir/tasks.md"

  [[ -f "$scope_file" ]] || return 0
  [[ -f "$review_file" ]] || return 0
  [[ ! -f "$tasks_file" ]] || return 0

  if ! grep -q 'status:[[:space:]]*pass' "$review_file" 2>/dev/null; then
    log "change $change_ref: proposal_review 未 pass，跳过物化"
    return 0
  fi

  if grep -q '"materialized"[[:space:]]*:[[:space:]]*true' "$scope_file" 2>/dev/null; then
    log "change $change_ref: 已物化，跳过"
    return 0
  fi

  [[ -f "$CATALOG_FILE" ]] || {
    echo "[materialize-repos] catalog 不存在: $CATALOG_FILE" >&2
    exit 1
  }

  log "物化 change $change_ref catalog=$CATALOG_FILE"

  # 简易解析 scope.json（依赖 jq 若可用，否则仅支持最小字段）
  if command -v jq >/dev/null 2>&1; then
    local repos
    repos="$(jq -r '.affected_repos[]? | select(.confidence != "low") | .repo_key' "$scope_file")"
    for repo_key in $repos; do
      materialize_one_repo "$repo_key"
    done
    local now
    now="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
    jq '.materialized = true | .materialized_at = "'"$now"'"' "$scope_file" > "$scope_file.tmp" && mv "$scope_file.tmp" "$scope_file"
  else
    echo "[materialize-repos] 需要 jq 解析 scope.json" >&2
    exit 1
  fi

  log "change $change_ref 物化完成"
}

materialize_one_repo() {
  local repo_key="$1"
  local target="$WORKSPACE/repos/$repo_key"

  if [[ -d "$target/.git" ]]; then
    log "repos/$repo_key 已存在，跳过 clone"
    return 0
  fi

  local git_url default_branch
  git_url="$(grep -A 20 "^  ${repo_key}:" "$CATALOG_FILE" | grep 'git_url:' | head -1 | sed 's/.*git_url:[[:space:]]*"\?\([^"]*\)"\?.*/\1/')"
  default_branch="$(grep -A 20 "^  ${repo_key}:" "$CATALOG_FILE" | grep 'default_branch:' | head -1 | sed 's/.*default_branch:[[:space:]]*"\?\([^"]*\)"\?.*/\1/')"
  default_branch="${default_branch:-main}"

  if [[ -z "$git_url" ]]; then
    echo "[materialize-repos] catalog 缺少 repo_key: $repo_key" >&2
    exit 1
  fi

  mkdir -p "$WORKSPACE/repos"
  log "clone $repo_key branch=$default_branch"
  git clone --depth 1 --branch "$default_branch" "$git_url" "$target"
}

for change_dir in "$CHANGES_DIR"/*/; do
  [[ -d "$change_dir" ]] || continue
  materialize_change "$change_dir"
done

exit 0
