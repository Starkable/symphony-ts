#!/usr/bin/env bash
# 扫描宿主机 git 镜像，生成 services/catalog.yaml（供物化脚本解析 git_url）
set -euo pipefail

SCAN_ROOT="${SYMPHONY_CATALOG_SCAN_ROOT:-}"
OUTPUT="${SYMPHONY_CATALOG_OUTPUT:-}"

usage() {
  echo "用法: generate-catalog.sh" >&2
  echo "  环境变量 SYMPHONY_CATALOG_SCAN_ROOT  扫描根目录（必填，如 F:/project）" >&2
  echo "  环境变量 SYMPHONY_CATALOG_OUTPUT       输出路径（默认: <scan_root>/../services/catalog.yaml）" >&2
  exit 1
}

[[ -n "$SCAN_ROOT" ]] || usage
[[ -d "$SCAN_ROOT" ]] || { echo "扫描根目录不存在: $SCAN_ROOT" >&2; exit 1; }

SCAN_ROOT="$(cd "$SCAN_ROOT" && pwd)"

if [[ -z "$OUTPUT" ]]; then
  if [[ -n "${SYMPHONY_REPO_ROOT:-}" ]]; then
    OUTPUT="${SYMPHONY_REPO_ROOT}/services/catalog.yaml"
  else
    OUTPUT="$(cd "$SCAN_ROOT/.." && pwd)/services/catalog.yaml"
  fi
fi

OUTPUT_DIR="$(dirname "$OUTPUT")"
mkdir -p "$OUTPUT_DIR"

GENERATED_AT="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"

# MCP project 命名：F-project-<repo_key>（与 index_repository 默认 project 名对齐）
mcp_project_name() {
  local key="$1"
  local drive_prefix=""
  if [[ "$SCAN_ROOT" =~ ^([A-Za-z]): ]]; then
    drive_prefix="$(echo "${BASH_REMATCH[1]}" | tr '[:lower:]' '[:upper:]')-project"
    echo "${drive_prefix}-${key}"
  else
    echo "F-project-${key}"
  fi
}

{
  echo "# 机器生成 — 勿手工编辑；重新运行 generate-catalog.sh 覆盖"
  echo "generated_at: \"${GENERATED_AT}\""
  echo "scan_root: \"${SCAN_ROOT}\""
  echo "repos:"
} > "$OUTPUT"

WARNINGS=0

for dir in "$SCAN_ROOT"/*; do
  [[ -d "$dir" ]] || continue
  [[ -d "$dir/.git" ]] || continue

  repo_key="$(basename "$dir")"
  host_path="$(cd "$dir" && pwd)"

  if ! git_url="$(git -C "$dir" remote get-url origin 2>/dev/null)"; then
    echo "[warn] 跳过 $repo_key: 无 origin remote" >&2
    WARNINGS=$((WARNINGS + 1))
    continue
  fi

  default_branch="main"
  if git -C "$dir" rev-parse --verify origin/HEAD >/dev/null 2>&1; then
    default_branch="$(git -C "$dir" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||' || echo main)"
  elif git -C "$dir" rev-parse --verify origin/master >/dev/null 2>&1; then
    default_branch="master"
  fi

  mcp_project="$(mcp_project_name "$repo_key")"

  {
    echo "  ${repo_key}:"
    echo "    git_url: \"${git_url}\""
    echo "    host_path: \"${host_path}\""
    echo "    mcp_project: \"${mcp_project}\""
    echo "    default_branch: \"${default_branch}\""
  } >> "$OUTPUT"
done

echo "[generate-catalog] 已写入 $OUTPUT (warnings=$WARNINGS)"
