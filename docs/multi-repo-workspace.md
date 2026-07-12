# 多项目 Workspace 操作指南

一个 PMS 需求跨多个业务仓时的 Symphony V1.2 编排模式。Orchestrator **无需改代码**；通过 MCP 发现、scope 产物、`before_run` 物化与 polyrepo 布局完成。

详见 change：`openspec/changes/multi-repo-scope-and-shared-skills/`。

## 三层资产

| 层 | 内容 | 位置 |
|----|------|------|
| 环境层 | Policy skills、catalog、MCP 索引 | 宿主机 `SYMPHONY_POLICY_ROOT`、`SYMPHONY_CATALOG_*` |
| Issue 层 | OpenSpec 六产物 + `scope.json` | `workspace/openspec/changes/<ChangeRef>/` |
| 业务层 | 业务源码 | `workspace/repos/<repo_key>/`（物化后） |

## 时序

```
after_create     → openspec init + skills 引用（无业务 clone）
clarify          → MCP 发现 + proposal + scope.json
proposal_review  → scope 闸门（pass 后冻结）
before_run       → catalog + clone → repos/*
plan             → 现状复核 + 按仓 tasks
execute …        → 改 repos/* 下代码
```

## 宿主机一次性准备

### 1. 环境变量

| 变量 | 说明 |
|------|------|
| `SYMPHONY_POLICY_ROOT` | `symphony-openspec-bundle` 根目录 |
| `SYMPHONY_REPO_ROOT` | `symphony-ts` 根目录（hook 引用 snippets） |
| `SYMPHONY_CATALOG_SCAN_ROOT` | 本地 git 镜像根 |
| `SYMPHONY_CATALOG_OUTPUT` | 可选，默认 `$SYMPHONY_REPO_ROOT/services/catalog.yaml` |
| `SYMPHONY_CATALOG_FILE` | 物化脚本读的 catalog 路径（优先于 repo 默认路径） |

生成 catalog：

```powershell
$env:SYMPHONY_CATALOG_SCAN_ROOT = "F:\project"
$env:SYMPHONY_REPO_ROOT = "F:\project\symphony-ts"
& "$env:SYMPHONY_REPO_ROOT\scripts\services\generate-catalog.ps1"
```

### 2. 生成 services/catalog.yaml

```bash
export SYMPHONY_CATALOG_SCAN_ROOT=/path/to/project/mirrors
bash scripts/services/generate-catalog.sh
```

**mcp_project 命名规则**：扫描根为 `F:/project/<repo_key>` 时，catalog 写入 `mcp_project: F-project-<repo_key>`，须与 `codebase-memory-mcp` `index_repository` 建立的 project 名一致。生成后可用 `list_projects` 核对 `root_path` 与 `host_path` 相同。

### 3. MCP 索引预构建

对每个镜像仓（示例 leke 三仓）：

1. `index_repository(repo_path=<host_path>, mode=full|moderate)`
2. 全部索引完成后跑一次：
   `index_repository(mode=cross-repo-intelligence, target_projects=["*"])`
3. 可选 `persistence: true` 导出 `.codebase-memory/graph.db.zst`

**leke 试跑清单**：

| repo_key | host_path | mcp_project |
|----------|-----------|-------------|
| leke-refund | F:/project/leke-refund | F-project-leke-refund |
| leke-api-manage | F:/project/leke-api-manage | F-project-leke-api-manage |
| leke-refund-html | F:/project/leke-refund-html | F-project-leke-refund-html |

定期 `detect_changes` 重建索引，避免 clarify 现状分析过期。

### 4. Policy skills

`bootstrap/install.sh` 默认 **symlink** bundle `skills/` 至 workspace `.cursor/skills/`（Windows 用 junction）。强制拷贝：`install.sh --copy`。

Skills 属环境资产，**不**进入业务 git 仓。

## WORKFLOW hooks 示例

```yaml
hooks:
  after_create: |
    openspec --version
    if [ ! -f openspec/config.yaml ]; then
      openspec init --tools none
    fi
    if [ -n "${SYMPHONY_POLICY_ROOT:-}" ]; then
      bash "${SYMPHONY_POLICY_ROOT}/bootstrap/install.sh" "$(pwd)"
    fi
    test -f openspec/config.yaml
    test -f .cursor/skills/openspec-new-change/SKILL.md

  before_run: |
    if [ -n "${SYMPHONY_REPO_ROOT:-}" ] && [ -f "${SYMPHONY_REPO_ROOT}/docs/snippets/materialize-repos.sh" ]; then
      bash "${SYMPHONY_REPO_ROOT}/docs/snippets/materialize-repos.sh"
    fi
```

多项目模式 **after_create 不含** 业务 `git clone` / `pnpm install`。

## Workspace 布局

```
workspace/
├── openspec/changes/<ChangeRef>/
│   ├── proposal.md
│   ├── scope.json
│   └── …
├── .cursor/skills/     → junction/symlink → bundle/skills
├── repos/
│   ├── leke-refund/
│   └── leke-api-manage/
└── .symphony/policy-bundle.json
```

## scope.json

见 `symphony-openspec-bundle/docs/scope-schema.md`。

## 默认决策

- scope 在 `proposal_review pass` 后冻结
- 单 PMS 工单 + polyrepo
- plan 漏仓 → review fail → clarify 修订
- 编排根：空 workspace + `openspec init`

## 相关文件

- [symphony-agent-workflow.md](./symphony-agent-workflow.md)
- [snippets/openspec-workspace-bootstrap.sh](./snippets/openspec-workspace-bootstrap.sh)
- [snippets/materialize-repos.sh](./snippets/materialize-repos.sh)
- [snippets/materialize-repos.ps1](./snippets/materialize-repos.ps1)
