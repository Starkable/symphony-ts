## ADDED Requirements

### Requirement: 独立仓库自包含布局

Portable OpenSpec Bundle SHALL 作为 **独立 git 仓库** 发布，仓库根目录 SHALL 包含且仅通过以下顶层目录组织运行时资产：`skills/`、`openspec/`、`templates/`、`docs/`、`bootstrap/`，以及根文件 `bundle.yaml` 与 `README.md`。

#### Scenario: 克隆后即可识别 bundle 根

- **WHEN** 操作者克隆 bundle 仓库到任意路径
- **THEN** 仓库根 SHALL 存在 `bundle.yaml` 与 `bootstrap/install.sh`（或 `install.ps1`）
- **AND** SHALL 存在 `skills/` 目录且包含至少一个 `openspec-*` 与一个 `symphony-*` skill

#### Scenario: 无需 symphony-ts 作为 skill 来源

- **WHEN** workspace 已通过 bundle 完成 install
- **THEN** agent 运行 V1.1 OpenSpec 流程 SHALL NOT 依赖从 `symphony-ts/.cursor/skills` 或 `symphony-ts/.agents/skills` 额外拷贝

### Requirement: bundle.yaml 元数据

仓库根 SHALL 提供 `bundle.yaml`，至少包含字段：`id`（英文 kebab-case）、`display_name`（中文展示名）、`version`（semver）、`openspec_cli`（兼容版本范围）、`schema`（默认 `spec-driven`）。

#### Scenario: 版本审计可读

- **WHEN** install 成功写入 `.symphony/policy-bundle.json`
- **THEN** 文件内容 SHALL 包含与 `bundle.yaml` 一致的 `id` 与 `version`

### Requirement: skills 目录 vendoring

`skills/` SHALL 包含 V1.1 所需的 **完整** openspec CLI skill 快照（至少 `openspec-explore`、`openspec-new-change`、`openspec-continue-change`、`openspec-apply-change`、`openspec-archive-change`）及全部 symphony 阶段 skill；install 时 SHALL 拷贝至 workspace `.cursor/skills/`。

#### Scenario: 英文 skill 目录名

- **WHEN** 列出 `skills/` 下子目录
- **THEN** 每个 skill 目录名 SHALL 为英文 kebab-case
- **AND** SHALL NOT 存在中文目录名（如 `symphony-提案评审`）

### Requirement: openspec 与模板资产

仓库 SHALL 在 `openspec/config.yaml` 提供中文 `context` 与 `rules`；SHALL 在 `templates/` 提供 workpad 与阶段报告模板；SHALL 在 `docs/phase-artifact-contract.md` 定义 Dashboard 主产物契约。

#### Scenario: config 覆盖 init 默认

- **WHEN** install 在仅有 `openspec init` 默认 config 的 workspace 上执行
- **THEN** 安装后 `openspec/config.yaml` SHALL 与 bundle 内中文 config 一致
