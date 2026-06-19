## ADDED Requirements

### Requirement: symphony-ts 不 vendoring 业务 skill

symphony-ts SHALL NOT 作为 V1.1 运行时 OpenSpec/symphony skills 的权威来源；文档 SHALL 指向独立 bundle 仓库（或团队 fork）并通过 `SYMPHONY_POLICY_ROOT` 注入。

#### Scenario: WORKFLOW 示例引用独立仓

- **WHEN** 阅读 `examples/workflow-cursor-policy/WORKFLOW.md` 或 `examples/workflow-pms-openspec/WORKFLOW.md`
- **THEN** Skills 节 SHALL 说明 `SYMPHONY_POLICY_ROOT` 指向 bundle 根目录
- **AND** SHALL NOT 列出「从 symphony-ts 拷贝 openspec-*」为默认步骤

### Requirement: bootstrap 片段简化

`docs/snippets/openspec-workspace-bootstrap.sh` SHALL 在配置 `SYMPHONY_POLICY_ROOT` 时仅调用 `bootstrap/install.sh`（或 `install.ps1`）；SHALL NOT 包含拷贝 `.agents/skills` 或分源拷贝 `openspec-*` 的逻辑。

#### Scenario: 片段无 agents 分支

- **WHEN** 阅读 bootstrap 片段 shell 脚本
- **THEN** SHALL NOT 出现 `.agents/skills` 路径

### Requirement: examples 目录指向独立仓

symphony-ts `examples/` SHALL 提供指向独立 bundle 仓库的说明（`examples/symphony-openspec-bundle/README.md` 或等价）；MAY 使用 git submodule 引用独立仓；SHALL NOT 长期维护与独立仓重复的完整 skill 副本于 `examples/symphony-policy-bundle/`。

#### Scenario: 开发者找到 bundle 仓库地址

- **WHEN** 阅读 `docs/symphony-agent-workflow.md` 或 `docs/symphony-workflow-evolution-plan.md`
- **THEN** SHALL 能找到独立 bundle 仓库的定位说明与 `SYMPHONY_POLICY_ROOT` 配置示例

### Requirement: symphony-ts 保留 openspec meta

symphony-ts 内 `openspec/changes/*` 与 `openspec/config.yaml` SHALL 继续仅服务 **symphony-ts 自身开发**；独立 bundle SHALL NOT 要求修改 symphony-ts meta openspec 目录。

#### Scenario: meta 与 runtime 分离

- **WHEN** 团队在业务 target repo 运行 Symphony issue
- **THEN** 业务 workspace 的 `openspec/changes/<ChangeRef>/` SHALL 与 symphony-ts 仓库内 meta change 无耦合
