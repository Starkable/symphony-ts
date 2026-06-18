## MODIFIED Requirements

### Requirement: Workpad 阶段状态机

Policy 工作流 SHALL 使用 `.symphony/workpad.md` 记录流程态（Phase、ChangeRef、Gate Log、Notes）。V1 模式（`Mode: v1-openspec`）下 Phase 取值 SHALL 包含：`clarify`、`plan`、`proposal_review`、`execute`、`verify`、`archive`、`done`、`failed`。非 V1 模式可继续使用 `blocked`、`submit`、`handoff`。

#### Scenario: 新 issue 首次 dispatch

- **WHEN** workspace 中不存在 workpad 或 Phase 未设置
- **THEN** agent SHALL 初始化 workpad 且 Phase SHALL 为 `clarify`

#### Scenario: Phase 驱动 turn 行为

- **WHEN** agent 开始任意 turn
- **THEN** agent SHALL 读取 workpad Phase 并 SHALL 仅执行该 Phase 允许的动作

### Requirement: C0 澄清硬门禁

在 Phase 为 `clarify` 或 `failed` 恢复澄清前，agent MUST NOT 修改产品代码（包括但不限于 `src/`、`tests/`、应用配置中的实现性变更），MUST NOT 进入 `execute` Phase，MUST NOT 创建实现性 git commit。V1 模式下 C0 通过前 MUST NOT 执行 `openspec new change` 或 `openspec-apply-change`。

#### Scenario: 澄清未完成时禁止写代码

- **WHEN** Workpad 中 `Clarification` checklist 存在未勾选项或存在未解决的高影响 unknown
- **THEN** agent MUST NOT 修改 `src/` 或 `tests/` 下的文件

#### Scenario: 澄清完成可进入计划

- **WHEN** `Clarification` checklist 全部勾选且无 open 的高影响 unknown
- **THEN** agent MAY 将 Phase 设为 `plan` 且 V1 下 SHALL 通过 OpenSpec 创建制品而非在 workpad 手写 Plan

### Requirement: 提案评审 Subagent

进入 `proposal_review` Phase 时，V2 模式 agent SHOULD 启动 readonly Proposal Reviewer Subagent。V1 模式（`Mode: v1-openspec`）下主 agent SHALL 自审 openspec 制品并输出 `REVIEW_REPORT`，SHALL NOT 要求 Subagent。

#### Scenario: V1 评审通过进入执行

- **WHEN** `Mode` 为 `v1-openspec` 且 Notes 含 `REVIEW_REPORT: PASS`
- **THEN** Phase MAY 设为 `execute`

#### Scenario: V2 Subagent 评审

- **WHEN** `Mode` 非 `v1-openspec` 且 Subagent 产出 `REVIEW_REPORT: PASS`
- **THEN** Phase MAY 设为 `execute`

### Requirement: QA Verifier Subagent 硬门禁

V2 模式下进入 `verify` Phase 时，agent MUST 启动 readonly QA Verifier Subagent。V1 模式（`Mode: v1-openspec`）下主 agent SHALL 执行 `tasks.md` 的 `## Validation` 并输出 `VERIFICATION_REPORT`；V1 不强制 Subagent。

#### Scenario: V1 验证通过方可归档

- **WHEN** `Mode` 为 `v1-openspec` 且 Notes 含 `VERIFICATION_REPORT: PASS`
- **THEN** Phase MAY 设为 `archive`

#### Scenario: V2 Subagent 验证通过

- **WHEN** `Mode` 非 `v1-openspec` 且 Subagent 产出 `VERIFICATION_REPORT: PASS`
- **THEN** Phase MAY 设为 `archive`

#### Scenario: 主 agent 不得绕过 V2 Subagent

- **WHEN** `Mode` 非 `v1-openspec` 且不存在 `VERIFICATION_REPORT: PASS` 来自 Subagent
- **THEN** agent MUST NOT 将 Phase 设为 `archive` 或 `submit`

## REMOVED Requirements

### Requirement: 澄清暂挂 blocked

**Reason**: V1 全自动模式不等待人工；高影响 unknown 改用语义等价的 `failed` + `CLARIFY_BLOCKED`。V2 可恢复 blocked。

**Migration**: 使用 `Mode: v1-openspec` 的 WORKFLOW 不再引用 `Phase=blocked`；旧 WORKFLOW 可保留至 V2 统一。
