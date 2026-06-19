## ADDED Requirements

### Requirement: 策略包目录结构

文档 SHALL 定义外部策略包（`symphony-policy-bundle`）最低目录结构，包含：`.cursor/skills/`、`.agents/skills/symphony-v1-policy/`、可选 `openspec/config.yaml`、`templates/`、`bootstrap/`、`docs/phase-artifact-contract.md`、`bundle.version`。

#### Scenario: 运维部署策略包

- **WHEN** 操作者将策略包克隆或复制到 `F:/symphony-policy-bundle`
- **AND** 设置 `SYMPHONY_POLICY_ROOT` 指向该目录
- **THEN** workspace bootstrap SHALL 能够拷贝 skills 并可选 seed openspec config

### Requirement: SYMPHONY_POLICY_ROOT 注入

`hooks.after_create` SHALL 支持通过环境变量 `SYMPHONY_POLICY_ROOT` 指向策略包根目录；SHALL NOT 要求修改 `symphony-ts` 仓库内 `.cursor/skills` 作为业务运行时来源。

#### Scenario: bootstrap 拷贝 skills

- **WHEN** `after_create` 执行且 `SYMPHONY_POLICY_ROOT/.cursor/skills` 存在
- **THEN** workspace SHALL 获得策略包内 openspec/symphony 定制 skills 副本

#### Scenario: 未配置策略包

- **WHEN** `SYMPHONY_POLICY_ROOT` 未设置
- **THEN** 文档 SHALL 说明 fallback 行为（仅 `openspec init`、无定制 skills）
- **AND** Dashboard 仍可只读已有 artifact store 数据

### Requirement: 策略包版本审计

bootstrap MAY 在 workspace 写入 `.symphony/policy-bundle.json`，记录 `bundle.version` 与注入时间。

#### Scenario: 审计文件存在

- **WHEN** bootstrap 成功且策略包含 `bundle.version`
- **THEN** workspace MAY 含 `.symphony/policy-bundle.json` 且内容含版本字符串

### Requirement: 中文策略包内容

策略包内 skills 说明、openspec config context/rules、报告模板 SHALL 使用简体中文；Phase id 与 OpenSpec 标准文件名 SHALL 保持英文。

#### Scenario: skill 中文说明

- **WHEN** agent 读取 workspace 内从策略包拷贝的 SKILL.md
- **THEN** 步骤说明与输出要求 SHALL 为中文

#### Scenario: 文件名保持英文

- **WHEN** agent 写入 openspec change 制品
- **THEN** 标准文件名 SHALL 仍为 `proposal.md`、`tasks.md` 等

### Requirement: 示例策略包快照

symphony-ts SHALL 在 `examples/symphony-policy-bundle/` 提供 V1.1 策略包最小可运行示例（或等效路径文档），供本地开发与验收引用。

#### Scenario: 示例可被 WORKFLOW 引用

- **WHEN** 开发者阅读 `docs/symphony-workflow-evolution-plan.md` 或 WORKFLOW 示例
- **THEN** SHALL 能找到指向 `examples/symphony-policy-bundle/` 的说明
