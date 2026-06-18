## Context

`policy-v1-openspec-default` 将 openspec 与 Policy 绑定，但 `after_create` 示例混入了全局 CLI 安装。实际运维模型：

- **安装**：Symphony 宿主机人工一次（`openspec`、`agent`、symphony）
- **初始化**：每个 issue workspace 在 `after_create` 中，clone 后若缺 `openspec/config.yaml` 则 `openspec init`

## Goals / Non-Goals

**Goals:**

- 文档与示例与上述模型一致
- hook 脚本：clone → 业务 install → 条件 `openspec init --tools none` → 可选复制 Policy skills → 自检
- 若目标仓已提交 `openspec/`，hook 跳过 init

**Non-Goals:**

- orchestrator 解析 hook 失败阻断 dispatch（仍文档约定）
- 在 hook 内安装 Node/openspec 包
- 为每个 ticket 预建 `openspec/changes/<ChangeRef>/`

## Decisions

### D1：init 命令

- **选择**：`openspec init --tools none`（非交互；skills 由团队拷贝或目标仓已有 `.cursor`）
- **备选**：`--tools cursor` — 可能与 symphony-ts 自带 skills 重复，V1 用 none + 文档说明拷贝路径

### D2：skills 拷贝

- 可选：若设置 `SYMPHONY_POLICY_ROOT` 且 workspace 无 `.cursor/skills/openspec-explore`，从该路径复制
- 不强制进 hook 脚本默认值，在 snippet 注释中提供

### D3：CLI 检查

- hook 末尾：`openspec --version`（验证宿主机已装，**不** install）
- 失败则 hook exit 1

## Risks / Trade-offs

| 风险 | 缓解 |
|------|------|
| Windows hook 无 bash | 文档注明 Git Bash/WSL；示例以 POSIX shell 为主 |
| init 与业务仓已有 openspec 冲突 | 仅 `! -f openspec/config.yaml` 时 init |

## Migration Plan

1. 更新文档与示例
2. 运维在宿主机确认 `openspec` 已装，从 WORKFLOW 删除 `npm i -g`
