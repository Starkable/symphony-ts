## MODIFIED Requirements

### Requirement: 策略包目录结构

文档 SHALL 定义 **Portable OpenSpec Bundle 独立仓库** 最低目录结构，包含：`bundle.yaml`、`README.md`、`skills/`（全部运行时 skill）、`openspec/config.yaml`、`templates/`、`bootstrap/install.sh`（及 `install.ps1`）、`docs/phase-artifact-contract.md`。SHALL NOT 要求 `.agents/skills/` 或策略包内嵌套 `.cursor/skills/` 作为源布局（install 目标路径仍为 workspace `.cursor/skills/`）。

#### Scenario: 运维部署策略包

- **WHEN** 操作者将 bundle 仓库克隆或复制到任意路径（如 `F:/symphony-openspec-bundle`）
- **AND** 设置 `SYMPHONY_POLICY_ROOT` 指向该仓库根目录
- **THEN** 执行 `bootstrap/install.sh` SHALL 完成 skills、config、模板与审计文件部署

#### Scenario: 单目录复制即可迁移

- **WHEN** 操作者复制整个 bundle 根目录到新路径并更新 `SYMPHONY_POLICY_ROOT`
- **THEN** 无需从 symphony-ts 额外拷贝文件即可在新路径完成 install

### Requirement: SYMPHONY_POLICY_ROOT 注入

`hooks.after_create` SHALL 支持通过环境变量 `SYMPHONY_POLICY_ROOT` 指向 bundle 仓库根目录；SHALL NOT 要求修改 `symphony-ts` 仓库内 `.cursor/skills` 作为业务运行时来源；SHALL 通过 `bootstrap/install.sh` 注入而非检测 `SYMPHONY_POLICY_ROOT/.cursor/skills`。

#### Scenario: bootstrap 安装 skills

- **WHEN** `after_create` 执行且 `SYMPHONY_POLICY_ROOT/bootstrap/install.sh` 存在
- **THEN** workspace SHALL 从 `$SYMPHONY_POLICY_ROOT/skills/` 获得全部 openspec 与 symphony skill 副本

#### Scenario: 未配置策略包

- **WHEN** `SYMPHONY_POLICY_ROOT` 未设置
- **THEN** 文档 SHALL 说明 fallback 行为（仅 `openspec init`、无定制 skills）
- **AND** Dashboard 仍可只读已有 artifact store 数据

### Requirement: 策略包版本审计

bootstrap SHALL 在 workspace 写入 `.symphony/policy-bundle.json`，记录 `bundle.yaml` 的 `id`、`version`、`installed_at` 与 `bundle_root`。

#### Scenario: 审计文件存在

- **WHEN** install 成功且 `bundle.yaml` 含 version
- **THEN** workspace SHALL 含 `.symphony/policy-bundle.json` 且 version 与 bundle 一致

### Requirement: 示例策略包快照

symphony-ts SHALL 在 `examples/symphony-openspec-bundle/` 提供 **指向独立 bundle 仓库** 的说明（及可选 submodule）；SHALL NOT 要求在 `examples/symphony-policy-bundle/` 维护与独立仓重复的完整 skill 树作为长期真相源。

#### Scenario: 示例可被 WORKFLOW 引用

- **WHEN** 开发者阅读 workflow 示例或 evolution plan
- **THEN** SHALL 能找到独立 bundle 仓库与 `SYMPHONY_POLICY_ROOT` 配置说明

## REMOVED Requirements

### Requirement: 策略包内 .agents/skills 布局

**Reason**: V1.1 统一所有 skill 至 bundle `skills/` → workspace `.cursor/skills/`；`.agents/skills` 为历史遗留。

**Migration**: 将 `symphony-v1-policy` 移至 bundle `skills/symphony-v1-policy/`；删除 symphony-ts `.agents/skills/`。
